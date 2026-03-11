"""
Pure-Python DBAPI-2.0 adapter for Turso / libSQL via the HTTP pipeline API.

No compiled extensions needed — uses httpx for synchronous HTTP calls.
Works as a drop-in DBAPI that SQLAlchemy can use with the SQLite dialect.
"""

import httpx
from typing import Any, List, Optional, Sequence, Tuple

# ─── DBAPI module-level constants ────────────────────────────────────────────
apilevel    = "2.0"
threadsafety = 1          # connections can't be shared across threads
paramstyle  = "qmark"    # ? placeholders, positional args

# Transaction-control statements that we handle locally (Turso auto-commits)
_TX_STMTS = frozenset(
    ["BEGIN", "COMMIT", "ROLLBACK", "SAVEPOINT", "RELEASE", "BEGIN DEFERRED",
     "BEGIN IMMEDIATE", "BEGIN EXCLUSIVE"]
)


# ─── Connection ───────────────────────────────────────────────────────────────

class TursoConnection:
    isolation_level = None   # SQLAlchemy/pysqlite compatibility

    def __init__(self, url: str, auth_token: str) -> None:
        # Accept both libsql:// and https://
        self._base_url = url.replace("libsql://", "https://")
        self._auth_token = auth_token
        self._client = httpx.Client(
            headers={
                "Authorization": f"Bearer {auth_token}",
                "Content-Type": "application/json",
            },
            timeout=30.0,
        )

    # ── DBAPI interface ────────────────────────────────────────────────────

    def cursor(self) -> "TursoCursor":
        return TursoCursor(self)

    def commit(self) -> None:
        pass   # Turso auto-commits each pipeline request

    def rollback(self) -> None:
        pass

    def close(self) -> None:
        self._client.close()

    # ── Pysqlite compatibility shims ───────────────────────────────────────

    def set_isolation_level(self, level: Any) -> None:
        self.isolation_level = level

    def create_function(self, name: str, num_params: int, func, **kwargs) -> None:
        pass   # pysqlite dialect calls this for REGEXP; Turso handles it server-side

    def create_aggregate(self, name: str, num_params: int, aggregate_class) -> None:
        pass   # pysqlite compatibility shim

    def __enter__(self):
        return self

    def __exit__(self, *args):
        self.close()

    # ── Internal ───────────────────────────────────────────────────────────

    def _pipeline(self, sql: str, args: list) -> dict:
        """POST one statement to the Turso pipeline API and return its result."""
        payload = {
            "requests": [
                {"type": "execute", "stmt": {"sql": sql, "args": args}}
            ]
        }
        resp = self._client.post(f"{self._base_url}/v2/pipeline", json=payload)
        resp.raise_for_status()
        result = resp.json()["results"][0]
        if result["type"] == "error":
            msg = result.get("error", {}).get("message", "Unknown Turso error")
            raise Error(msg)
        return result["response"]["result"]


# ─── Cursor ───────────────────────────────────────────────────────────────────

class TursoCursor:
    def __init__(self, conn: TursoConnection) -> None:
        self._conn     = conn
        self.description: Optional[Tuple] = None
        self.rowcount: int = -1
        self.lastrowid: Optional[int] = None
        self._rows: List[tuple] = []
        self._pos: int = 0

    # ── DBAPI interface ────────────────────────────────────────────────────

    def execute(self, sql: str, params: Optional[Sequence] = None) -> "TursoCursor":
        keyword = sql.strip().split()[0].upper() if sql.strip() else ""

        # Pass transaction-control statements through silently
        if keyword in _TX_STMTS or sql.strip().upper() in _TX_STMTS:
            self.description = None
            self.rowcount     = 0
            self._rows        = []
            self._pos         = 0
            return self

        args = _encode_args(params) if params else []
        data = self._conn._pipeline(sql, args)

        cols = data.get("cols", [])
        self.description = (
            tuple((c["name"], None, None, None, None, None, None) for c in cols)
            if cols else None
        )
        self._rows = [
            tuple(_decode_cell(cell) for cell in row)
            for row in data.get("rows", [])
        ]
        self.rowcount = data.get("affected_row_count", len(self._rows))
        raw_lid = data.get("last_insert_rowid")
        self.lastrowid = int(raw_lid) if raw_lid else None
        self._pos = 0
        return self

    def executemany(self, sql: str, seq_of_params) -> None:
        for params in seq_of_params:
            self.execute(sql, params)

    def fetchone(self) -> Optional[tuple]:
        if self._pos >= len(self._rows):
            return None
        row = self._rows[self._pos]
        self._pos += 1
        return row

    def fetchall(self) -> List[tuple]:
        rows = self._rows[self._pos:]
        self._pos = len(self._rows)
        return rows

    def fetchmany(self, size: int = 1) -> List[tuple]:
        rows = self._rows[self._pos: self._pos + size]
        self._pos += len(rows)
        return rows

    def close(self) -> None:
        pass

    def __iter__(self):
        return self

    def __next__(self):
        row = self.fetchone()
        if row is None:
            raise StopIteration
        return row


# ─── Type helpers ─────────────────────────────────────────────────────────────

def _encode_args(params: Sequence) -> list:
    """Convert Python values to Turso's typed arg format.

    Turso pipeline API rules:
    - integer.value  → JSON string  (i64 precision)
    - float.value    → JSON number  (f64, NOT a string)
    - text/null      → as expected
    """
    out = []
    for p in params:
        if p is None:
            out.append({"type": "null", "value": None})
        elif isinstance(p, bool):
            out.append({"type": "integer", "value": str(int(p))})
        elif isinstance(p, int):
            out.append({"type": "integer", "value": str(p)})
        elif isinstance(p, float):
            out.append({"type": "float", "value": float(p)})   # must be JSON number
        else:
            out.append({"type": "text", "value": str(p)})
    return out


def _decode_cell(cell: dict) -> Any:
    """Convert a Turso typed cell back to a Python value."""
    if cell.get("type") == "null" or cell.get("value") is None:
        return None
    val = cell["value"]
    t   = cell.get("type", "text")
    if t == "integer":
        return int(val)
    if t == "float":
        return float(val)
    return val   # text / blob → str


# ─── Public connect() ─────────────────────────────────────────────────────────

def connect(url: str, auth_token: str) -> TursoConnection:
    return TursoConnection(url, auth_token)


# ─── DBAPI exceptions ────────────────────────────────────────────────────────

class Error(Exception):           pass
class DatabaseError(Error):       pass
class OperationalError(Error):    pass
class ProgrammingError(Error):    pass
class IntegrityError(Error):      pass
class InterfaceError(Error):      pass
class DataError(Error):           pass
class NotSupportedError(Error):   pass
class Warning(Exception):         pass

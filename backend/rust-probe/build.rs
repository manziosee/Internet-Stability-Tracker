use std::env;
use std::path::Path;

fn main() {
    // ISTTIME_LIB_DIR can point to a directory containing a pre-built libisttime.a.
    // In the Docker build this is set to /build/c-timing (where c-builder left the archive).
    // In local dev it falls through and compiles the C source with the cc crate.
    let lib_dir = env::var("ISTTIME_LIB_DIR").unwrap_or_else(|_| "../c-timing".to_string());

    let archive = format!("{}/libisttime.a", lib_dir);
    let src     = format!("{}/icmp.c",       lib_dir);

    if Path::new(&archive).exists() {
        // Link the pre-built static archive — no recompilation needed.
        println!("cargo:rustc-link-search=native={}", lib_dir);
        println!("cargo:rustc-link-lib=static=isttime");
        println!("cargo:rerun-if-changed={}", archive);
    } else if Path::new(&src).exists() {
        // Local development — compile from source.
        cc::Build::new()
            .file(&src)
            .include(&lib_dir)
            .opt_level(2)
            .warnings(true)
            .compile("isttime");
        println!("cargo:rerun-if-changed={}", src);
        println!("cargo:rerun-if-changed={}/icmp.h", lib_dir);
    } else {
        // Neither found — emit a warning but don't fail the build.
        // The FFI functions will return None/-1 gracefully at runtime.
        println!("cargo:warning=C timing library not found at {} — ICMP and C TCP probes will be unavailable", lib_dir);
    }
}

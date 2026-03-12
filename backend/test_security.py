#!/usr/bin/env python3
"""Quick test script for security endpoints"""
import asyncio
import sys
sys.path.insert(0, '/home/manzi/Documents/projects/Internet-Stability-Tracker/backend')

from app.services.network_security import NetworkSecurityService
from app.core.database import SessionLocal

async def test_security_features():
    """Test all security features"""
    db = SessionLocal()
    service = NetworkSecurityService(db)
    
    print("🔒 Testing Network Security Features...\n")
    
    # Test 1: Port Scan
    print("1️⃣ Testing Port Scan...")
    try:
        result = await service.scan_common_ports("127.0.0.1")
        print(f"   ✅ Port scan completed: {result['total_open']} open ports, {result['total_vulnerable']} vulnerable")
    except Exception as e:
        print(f"   ❌ Port scan failed: {e}")
    
    # Test 2: Privacy Score
    print("\n2️⃣ Testing Privacy Score...")
    try:
        result = await service.calculate_privacy_score()
        print(f"   ✅ Privacy score: {result.get('privacy_score', 'N/A')}/100 (Grade: {result.get('grade', 'N/A')})")
    except Exception as e:
        print(f"   ❌ Privacy score failed: {e}")
    
    # Test 3: VPN Recommendation
    print("\n3️⃣ Testing VPN Recommendation...")
    try:
        result = await service.recommend_vpn()
        print(f"   ✅ VPN needed: {result.get('should_use_vpn', 'Unknown')}")
        print(f"   Location: {result.get('your_location', 'Unknown')}")
    except Exception as e:
        print(f"   ❌ VPN recommendation failed: {e}")
    
    # Test 4: Intrusion Detection
    print("\n4️⃣ Testing Intrusion Detection...")
    try:
        result = await service.detect_intrusions("test-client-id")
        print(f"   ✅ Intrusions detected: {result.get('intrusions_detected', 0)}")
        print(f"   Status: {result.get('status', 'Unknown')}")
    except Exception as e:
        print(f"   ❌ Intrusion detection failed: {e}")
    
    # Test 5: Full Security Audit
    print("\n5️⃣ Testing Full Security Audit...")
    try:
        result = await service.run_security_audit("test-client-id")
        print(f"   ✅ Security audit completed successfully")
        print(f"   - Port scan: {'✓' if 'port_scan' in result else '✗'}")
        print(f"   - Intrusion detection: {'✓' if 'intrusion_detection' in result else '✗'}")
        print(f"   - Privacy score: {'✓' if 'privacy_score' in result else '✗'}")
        print(f"   - VPN recommendation: {'✓' if 'vpn_recommendation' in result else '✗'}")
    except Exception as e:
        print(f"   ❌ Security audit failed: {e}")
    
    db.close()
    print("\n✅ All security tests completed!")

if __name__ == "__main__":
    asyncio.run(test_security_features())

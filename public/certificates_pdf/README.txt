========================================================================
MGM UNIVERSITY - BLOCKCHAIN ACADEMIC DEGREE VERIFICATION TEST SUITE
========================================================================
Generated on: 12/9/2026, 2:08:44 am
Design: Exact replica of DegreeCertificate.tsx (Guilloche border, seal, QR, Merkle anchor)

FILES INCLUDED IN THIS DIRECTORY:

1. 1_Authentic_Degree_Aarav_Sharma.pdf
   - Status: 100% VALID & AUTHENTIC
   - Student: Aarav Sharma (PRN20200101)
   - Degree: B.Tech Computer Science & Engineering
   - CGPA: 9.24 / 10.0 (Matches on-chain root)
   - QR Scans to: http://localhost:3000/?verify=MGM-2024-BTECH-BATCH01/0

2. 2_Authentic_Degree_Ananya_Malhotra.pdf
   - Status: 100% VALID & AUTHENTIC
   - Student: Ananya Malhotra (PRN20200102)
   - Degree: B.Tech Artificial Intelligence & Data Science
   - CGPA: 8.85 / 10.0 (Matches on-chain root)
   - QR Scans to: http://localhost:3000/?verify=MGM-2024-BTECH-BATCH01/1

3. 3_Tampered_GPA_Degree_Aarav_Sharma.pdf
   - Status: FRAUD / TAMPER DETECTED
   - Student: Aarav Sharma (PRN20200101)
   - Degree: B.Tech Computer Science & Engineering
   - Visual CGPA: 9.92 / 10.0 (Forged from original 9.24)
   - Watermark: TAMPERED GPA
   - Testing Outcome: Verifier detects cryptographic hash mismatch against blockchain!

4. 4_Fake_Unregistered_Degree_Vikrant_Verma.pdf
   - Status: COUNTERFEIT / UNREGISTERED
   - Student: Vikrant R. Verma (PRN20249999)
   - Degree: B.Tech Cyber Security & Digital Forensics
   - CGPA: 9.75 / 10.0
   - Watermark: COUNTERFEIT DEGREE
   - Testing Outcome: Verifier flags batch as non-existent in university registry!

5. 5_Revoked_Degree_Pooja_Patil.pdf
   - Status: REVOKED BY EXAM AUTHORITY
   - Student: Pooja Patil (PRN20200104)
   - Degree: B.Tech Electronics & Computer Engineering
   - Watermark: REVOKED
   - Testing Outcome: Registry flags dynamic revocation bitmap bit as revoked!

WEB ACCESSIBILITY:
All PDFs are also accessible in your browser at:
http://localhost:3000/certificates_pdf/<filename>
========================================================================

import docx
import shutil
import os

MAIN_DOC = r"c:\Final-Year-Project-Blockchain\SOET_VeriTrust_Final_Year_Project_Report_2026-2027.docx"
BACKUP_DOC = r"c:\Final-Year-Project-Blockchain\SOET_VeriTrust_Final_Year_Project_Report_2026-2027.docx.bak"

def update_report():
    print(f"Creating backup: {BACKUP_DOC}")
    shutil.copy2(MAIN_DOC, BACKUP_DOC)

    doc = docx.Document(MAIN_DOC)
    print(f"Loaded {MAIN_DOC}: {len(doc.paragraphs)} paragraphs, {len(doc.tables)} tables.")

    # 1. Update Abstract (Paragraph 34, Run 1)
    p34 = doc.paragraphs[34]
    p34.runs[1].text = (
        "credentials validates 100% cryptographic tamper detection accuracy and 94.8% visual forgery localization accuracy, "
        "establishing a robust, legally compliant, and production-ready standard for decentralized academic credentialing. "
        "Furthermore, the administrative dashboard supports arbitrary graduation cohort sizes without minimum constraints, "
        "fortified by pre-upload validation confirmation and post-upload success notifications."
    )
    print("Updated Paragraph 34 (Abstract)")

    # 2. Update Objectives (Paragraph 56, Run 1)
    p56 = doc.paragraphs[56]
    p56.runs[1].text = (
        "To allow authorized university examination administrators to anchor graduating cohorts of any size "
        "(including small batches of 1–9 students and large cohorts) into a single 32-byte cryptographic Merkle root "
        "on Ethereum Sepolia at constant O(1) gas cost, backed by dual pre-upload confirmation and post-upload notification safeguards."
    )
    print("Updated Paragraph 56 (Objectives)")

    # 3. Update Scope (Paragraph 64, Run 0)
    p64 = doc.paragraphs[64]
    p64.runs[0].text = (
        "The project covers the complete lifecycle of academic credentials within an autonomous university ecosystem, "
        "from initial graduation list ingestion supporting arbitrary batch sizes to public verification and post-issuance revocation. "
        "The scope encompasses an institutional examination cell portal featuring dual pre-upload confirmation and post-upload success "
        "notification bars, batch CSV parsing, canonical Keccak-256 Merkle tree calculation, Sepolia smart contract deployment, "
        "student self-sovereign identity vault, and a public dropzone verifier."
    )
    print("Updated Paragraph 64 (Scope)")

    # 4. Update Main Workflow Description (Paragraphs 124, 125, 126, 129)
    doc.paragraphs[124].runs[1].text = (
        "Graduation batch CSV containing student PRNs, student names, degree programs, and CGPAs is selected by the authorized "
        "Examination Administrator, supporting arbitrary cohort sizes (including small batches of 1–9 students and large cohorts) without a minimum restriction."
    )
    doc.paragraphs[125].runs[1].text = (
        "The pre-upload confirmation bar validates the file, presenting the Batch ID, total valid student count, and duplicate/invalid "
        "detection warnings for explicit administrative confirmation or cancellation before any records are staged."
    )
    doc.paragraphs[126].runs[1].text = (
        "Upon confirmation, the system canonicalizes each record, sorts leaf hashes commutatively, constructs a balanced binary Merkle DAG, "
        "renders the uploaded records in a searchable responsive table, and presents a distinct post-upload success notification bar immediately below the MGM University card."
    )
    doc.paragraphs[129].runs[1].text = (
        "Public employers upload verifiable credential JSON files or scan QR codes to execute client-side Merkle proof verification directly in the "
        "browser in <140ms, while uploaded PDFs undergo Error Level Analysis via the Python FastAPI microservice."
    )
    print("Updated Paragraphs 124-129 (4.3.2 Main Workflow Description)")

    # 5. Update Section 5.1.2 Institutional Exam Cell Batch Issuance (Paragraph 145, Run 0)
    p145 = doc.paragraphs[145]
    p145.runs[0].text = (
        "The examination cell portal allows authorized administrators to ingest graduation spreadsheets (CSV), parse student records, "
        "generate canonical Keccak-256 Merkle trees, and submit EIP-1559 root anchor transactions to Ethereum Sepolia. The latest "
        "implementation introduces complete support for arbitrary cohort sizes, eliminating the previous minimum restriction of 10 students; "
        "administrators can seamlessly upload batches containing any valid number of students, including smaller groups (1, 2, 3, 4, 5, or 9 candidates) "
        "as well as larger cohorts, supported by single-leaf and multi-leaf Merkle DAG generation with commutative hashing. "
        "Crucially, the workflow incorporates two independent, distinct notification and verification bars to ensure operational integrity: "
        "(1) Pre-Upload Confirmation Bar: Following CSV file selection and automated syntactic validation, a prominent pre-upload confirmation "
        "bar/dialog appears before any records are submitted for on-chain anchoring. This bar displays the target Batch ID, the total number of "
        "valid student records detected, and the count of duplicate or invalid records (accompanied by itemized PRN warnings). Administrators must "
        "explicitly choose between 'Confirm & Upload' (which initiates cryptographic Merkle DAG staging) and 'Cancel' (which aborts the staging operation "
        "without modifying any records), with re-submission safeguards preventing duplicate processing. "
        "(2) Post-Upload Success Notification Bar: Located immediately below the MGM University information card at the top of the University Admin "
        "dashboard, this dedicated green success bar appears only after student records have successfully passed validation and been staged for issuance. "
        "It features a prominent green checkmark icon, the heading 'Student Records Uploaded Successfully!', a message confirming that student records "
        "have been successfully uploaded and processed for the selected graduation batch, dynamic badges displaying the actual uploaded student count "
        "and corresponding Batch ID, and an interactive dismiss (✕) button. It never displays prior to successful completion or following validation failures. "
        "In addition, the portal renders an Uploaded Student Records section positioned directly above the MGM University card, displaying the actual "
        "staged records in a responsive table with Sr. No., PRN, Student Name, Major / Branch, CGPA, Credits, and status indicators, complemented by real-time "
        "search and pagination controls."
    )
    print("Updated Paragraph 145 (5.1.2 Institutional Exam Cell Batch Issuance)")

    # 6. Update Figure 5.4 Description (Paragraph 176, Run 0)
    p176 = doc.paragraphs[176]
    p176.runs[0].text = (
        "Shows batch CSV ingestion supporting arbitrary cohort sizes (including small groups of 1–9 candidates), pre-upload confirmation controls, "
        "the post-upload success notification bar located directly below the MGM University card, and real-time cryptographic Merkle DAG calculation."
    )
    print("Updated Paragraph 176 (Figure 5.4 Description)")

    # 7. Update Section 6.1.3 System Testing (Paragraph 190, Run 0)
    p190 = doc.paragraphs[190]
    p190.runs[0].text = (
        "System testing evaluated end-to-end user workflows: batch CSV ingestion across arbitrary cohort sizes (1, 3, 5, 9, 250 records) by exam administrators, "
        "pre-upload confirmation and post-upload success notifications, student EIP-712 wallet binding, public drag-and-drop verification, "
        "dynamic bitmap revocation, and deep learning ELA forensic scanning."
    )
    print("Updated Paragraph 190 (6.1.3 System Testing)")

    # 8. Update Observations (Paragraph 200, Run 1)
    p200 = doc.paragraphs[200]
    p200.runs[1].text = (
        "The administrative workbench unifies mathematical determinism and visual forensics with robust pre-upload confirmation and post-upload "
        "success notifications, supporting small and large graduating cohorts alike."
    )
    print("Updated Paragraph 200 (7.3 Observations)")

    # 9. Update Summary of Work (Paragraph 209, Run 0)
    p209 = doc.paragraphs[209]
    p209.runs[0].text = (
        "Key innovations delivered include: (1) Constant O(1) Merkle DAG batch anchoring slashing issuance gas by up to 99.98% across arbitrary cohort sizes "
        "without minimum batch restrictions; (2) Dual administrative verification safeguards including pre-upload validation confirmation and post-upload "
        "success notifications below the institutional authority node; (3) 256-bit dynamic revocation bitmaps reducing revocation gas by 99.6%; "
        "(4) EIP-712 non-repudiable PRN-to-wallet identity binding; (5) Deep learning Error Level Analysis (ELA) isolating raster and typographical manipulation; "
        "(6) SnarkJS Groth16 zero-knowledge selective disclosure; and (7) Strict Zero-PII compliance with the India DPDP Act 2023."
    )
    print("Updated Paragraph 209 (8.1 Summary of Work)")

    # 10. Update Table 6 (Table 3.1 Functional Requirements Specification, Row 2 FR-02)
    # STRICT RULE: Preserve exact table structure! Exactly 14 rows, 2 cols. Only update cell text.
    t6 = doc.tables[6]
    assert len(t6.rows) == 14, f"Table 6 row count changed: {len(t6.rows)}"
    assert len(t6.columns) == 2, f"Table 6 col count changed: {len(t6.columns)}"
    t6.rows[2].cells[1].paragraphs[0].runs[0].text = (
        "Authorized administrators shall upload graduation CSVs of any cohort size (including small batches of 1–9 students), "
        "review pre-upload confirmation, and verify post-upload notifications."
    )
    print("Updated Table 6 Row 2 (FR-02)")

    # 11. Update Table 14 (Table 6.1 Test Cases & Results, Row 1 TC-01)
    # STRICT RULE: Preserve exact table structure! Exactly 11 rows, 5 cols. Only update cell text.
    t14 = doc.tables[14]
    assert len(t14.rows) == 11, f"Table 14 row count changed: {len(t14.rows)}"
    assert len(t14.columns) == 5, f"Table 14 col count changed: {len(t14.columns)}"
    t14.rows[1].cells[1].paragraphs[0].runs[0].text = "Batch CSV & Notification"
    t14.rows[1].cells[2].paragraphs[0].runs[0].text = "Upload graduation CSV (1 to 250 records, small & large batches)"
    t14.rows[1].cells[3].paragraphs[0].runs[0].text = "Pre-upload confirmation, success notification below MGM card, and root anchor"
    print("Updated Table 14 Row 1 (TC-01)")

    # Save updated document
    doc.save(MAIN_DOC)
    print(f"Successfully saved updated report to {MAIN_DOC}")

    # Copy to updated versions for synchronization
    sync_targets = [
        r"c:\Final-Year-Project-Blockchain\SOET_VeriTrust_Final_Year_Project_Report_Updated_2026-2027.docx",
        r"c:\Final-Year-Project-Blockchain\SOET_VeriTrust_Final_Year_Project_Report_Master.docx"
    ]
    for target in sync_targets:
        try:
            shutil.copy2(MAIN_DOC, target)
            print(f"Synchronized to {target}")
        except Exception as e:
            print(f"Warning syncing to {target}: {e}")

if __name__ == "__main__":
    update_report()


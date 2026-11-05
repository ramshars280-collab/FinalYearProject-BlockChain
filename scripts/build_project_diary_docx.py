import os
import docx
from docx.shared import Inches, Pt, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.oxml import parse_xml
from docx.oxml.ns import nsdecls

DOC_PATH = r"c:\Final-Year-Project-Blockchain\SOET_VeriTrust_Project_Diary.docx"
PDF_PATH = r"c:\Final-Year-Project-Blockchain\SOET_VeriTrust_Project_Diary.pdf"
FIG_DIR = r"c:\Final-Year-Project-Blockchain\artifacts\figures"

def create_diary():
    doc = docx.Document()

    # Configure Margins: 0.75 in
    for section in doc.sections:
        section.top_margin = Inches(0.75)
        section.bottom_margin = Inches(0.75)
        section.left_margin = Inches(0.75)
        section.right_margin = Inches(0.75)

    PRIMARY = RGBColor(15, 23, 42)     # #0F172A
    NAVY = RGBColor(30, 58, 138)       # #1E3A8A
    BODY_COLOR = RGBColor(30, 41, 59)  # #1E293B
    MUTED = RGBColor(71, 85, 105)      # #475569
    HEX_HEADER = "1E3A8A"
    HEX_ALT = "F8FAFC"
    HEX_BORDER = "CBD5E1"
    HEX_CALLOUT_BG = "EFF6FF"

    def set_cell_background(cell, hex_color):
        shading = parse_xml(f'<w:shd {nsdecls("w")} w:fill="{hex_color}"/>')
        cell._tc.get_or_add_tcPr().append(shading)

    def set_cell_margins(cell, top=100, bottom=100, left=140, right=140):
        tcPr = cell._tc.get_or_add_tcPr()
        tcMar = parse_xml(f'''
            <w:tcMar {nsdecls("w")}>
                <w:top w:w="{top}" w:type="dxa"/>
                <w:bottom w:w="{bottom}" w:type="dxa"/>
                <w:left w:w="{left}" w:type="dxa"/>
                <w:right w:w="{right}" w:type="dxa"/>
            </w:tcMar>
        ''')
        tcPr.append(tcMar)

    def set_table_borders(table, color=HEX_BORDER):
        tblPr = table._tbl.tblPr
        borders = parse_xml(f'''
            <w:tblBorders {nsdecls("w")}>
                <w:top w:val="single" w:sz="6" w:space="0" w:color="{color}"/>
                <w:left w:val="single" w:sz="6" w:space="0" w:color="{color}"/>
                <w:bottom w:val="single" w:sz="8" w:space="0" w:color="{color}"/>
                <w:right w:val="single" w:sz="6" w:space="0" w:color="{color}"/>
                <w:insideH w:val="single" w:sz="4" w:space="0" w:color="{color}"/>
                <w:insideV w:val="single" w:sz="4" w:space="0" w:color="{color}"/>
            </w:tblBorders>
        ''')
        tblPr.append(borders)

    def add_page_header_title(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(8)
        p.paragraph_format.space_after = Pt(3)
        r = p.add_run(text)
        r.font.name = "Arial"
        r.font.size = Pt(13)
        r.font.bold = True
        r.font.color.rgb = NAVY
        return p

    def add_section_heading(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(6)
        p.paragraph_format.space_after = Pt(2.5)
        r = p.add_run(text)
        r.font.name = "Arial"
        r.font.size = Pt(11)
        r.font.bold = True
        r.font.color.rgb = PRIMARY
        return p

    def add_subheading(text):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(4)
        p.paragraph_format.space_after = Pt(2)
        r = p.add_run(text)
        r.font.name = "Arial"
        r.font.size = Pt(10)
        r.font.bold = True
        r.font.color.rgb = NAVY
        return p

    def add_bullet(text, prefix="• "):
        p = doc.add_paragraph()
        p.paragraph_format.left_indent = Inches(0.2)
        p.paragraph_format.space_before = Pt(1)
        p.paragraph_format.space_after = Pt(2.5)
        p.paragraph_format.line_spacing = 1.15
        r_pre = p.add_run(prefix)
        r_pre.font.name = "Arial"
        r_pre.font.size = Pt(10)
        r_pre.font.bold = True
        r_pre.font.color.rgb = NAVY
        r_txt = p.add_run(text)
        r_txt.font.name = "Arial"
        r_txt.font.size = Pt(9.5)
        r_txt.font.color.rgb = BODY_COLOR
        return p

    def add_paragraph(text, space_after=4):
        p = doc.add_paragraph()
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(space_after)
        p.paragraph_format.line_spacing = 1.15
        r = p.add_run(text)
        r.font.name = "Arial"
        r.font.size = Pt(9.5)
        r.font.color.rgb = BODY_COLOR
        return p

    def add_callout(title, body_text):
        tbl = doc.add_table(rows=1, cols=1)
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        tbl.autofit = False
        tbl.columns[0].width = Inches(6.8)
        cell = tbl.cell(0, 0)
        set_cell_background(cell, HEX_CALLOUT_BG)
        set_cell_margins(cell, top=120, bottom=120, left=160, right=160)
        tcPr = cell._tc.get_or_add_tcPr()
        borders = parse_xml(f'''
            <w:tcBorders {nsdecls("w")}>
                <w:top w:val="none"/>
                <w:left w:val="single" w:sz="24" w:space="0" w:color="{HEX_HEADER}"/>
                <w:bottom w:val="none"/>
                <w:right w:val="none"/>
            </w:tcBorders>
        ''')
        tcPr.append(borders)
        p = cell.paragraphs[0]
        p.paragraph_format.space_before = Pt(2)
        p.paragraph_format.space_after = Pt(2)
        r_t = p.add_run(f"{title}\n")
        r_t.font.name = "Arial"
        r_t.font.size = Pt(9.5)
        r_t.font.bold = True
        r_t.font.color.rgb = NAVY
        r_b = p.add_run(body_text)
        r_b.font.name = "Arial"
        r_b.font.size = Pt(9)
        r_b.font.color.rgb = BODY_COLOR

    def add_image_figure(filename, caption):
        full_path = os.path.join(FIG_DIR, filename)
        if os.path.exists(full_path):
            p = doc.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p.paragraph_format.space_before = Pt(6)
            p.paragraph_format.space_after = Pt(2)
            run = p.add_run()
            run.add_picture(full_path, width=Inches(6.2))
            
            p_cap = doc.add_paragraph()
            p_cap.alignment = WD_ALIGN_PARAGRAPH.CENTER
            p_cap.paragraph_format.space_before = Pt(1)
            p_cap.paragraph_format.space_after = Pt(6)
            rc = p_cap.add_run(caption)
            rc.font.name = "Arial"
            rc.font.size = Pt(8.5)
            rc.font.bold = True
            rc.font.italic = True
            rc.font.color.rgb = MUTED

    def format_table(tbl, col_widths, headers, data):
        tbl.alignment = WD_TABLE_ALIGNMENT.CENTER
        tbl.autofit = False
        set_table_borders(tbl)

        hdr_cells = tbl.rows[0].cells
        for idx, text in enumerate(headers):
            hdr_cells[idx].width = Inches(col_widths[idx])
            set_cell_background(hdr_cells[idx], HEX_HEADER)
            set_cell_margins(hdr_cells[idx], top=80, bottom=80, left=100, right=100)
            p = hdr_cells[idx].paragraphs[0]
            p.paragraph_format.space_before = Pt(2)
            p.paragraph_format.space_after = Pt(2)
            r = p.add_run(text)
            r.font.name = "Arial"
            r.font.size = Pt(9)
            r.font.bold = True
            r.font.color.rgb = RGBColor(255, 255, 255)

        for r_idx, row_data in enumerate(data):
            row_cells = tbl.add_row().cells
            bg = HEX_ALT if r_idx % 2 == 1 else "FFFFFF"
            for c_idx, val in enumerate(row_data):
                row_cells[c_idx].width = Inches(col_widths[c_idx])
                set_cell_background(row_cells[c_idx], bg)
                set_cell_margins(row_cells[c_idx], top=70, bottom=70, left=90, right=90)
                p = row_cells[c_idx].paragraphs[0]
                p.paragraph_format.space_before = Pt(1)
                p.paragraph_format.space_after = Pt(1.5)
                p.paragraph_format.line_spacing = 1.12
                r = p.add_run(str(val))
                r.font.name = "Arial"
                r.font.size = Pt(8.5)
                r.font.color.rgb = BODY_COLOR

    # =========================================================================
    # PAGE 1 — PROJECT ORIENTATION (EXACTLY AS SPECIFIED BY USER)
    # =========================================================================
    add_page_header_title("Page 1 — Project Orientation")
    add_section_heading("Project Orientation")
    add_bullet("A project orientation session was conducted by our Director, Dr. Parminder Kaur Ma’am, in the presence of project head Professor Deshmukh Ma’am.")
    add_bullet("The session provided an overview of the complete project development process to be followed for the academic project.")
    add_bullet("We were guided on how to identify and select a suitable project topic.")
    add_bullet("The importance of relevance, feasibility and scope while selecting a project topic was explained.")
    add_bullet("The faculty guided us on understanding the problem statement before starting the project.")
    add_bullet("The overall stages of project development were explained to us.")
    add_bullet("These stages included topic selection, preliminary study and literature review.")
    add_bullet("Further stages such as requirement analysis, system design and development were also discussed.")
    add_bullet("The process of testing, documentation and final presentation was explained.")
    add_bullet("Guidance was provided on properly planning and executing project activities at each stage.")
    add_bullet("The importance of maintaining regular project progress and proper documentation throughout the project was emphasized.")
    add_bullet("The responsibilities and expected workflow of the project team were also discussed.")
    add_bullet("The session helped us understand how to carry out the project in a systematic and planned manner.")
    add_bullet("The orientation provided a clear direction for beginning our project work and proceeding with the upcoming activities.")

    doc.add_page_break()

    # =========================================================================
    # PAGE 2 — PROJECT GROUP FORMATION & TOPIC SELECTION
    # =========================================================================
    add_page_header_title("Page 2 — Project Group Formation & Topic Selection")
    add_section_heading("2. Project Group Formation")
    add_paragraph(
        "As part of the project development process, a group of three members was formed to work collaboratively. "
        "The team members were assigned responsibilities according to their technical skills and areas of interest. "
        "The division of responsibilities helped the team manage different aspects of the project such as smart contract architecture, "
        "frontend web application development, edge API integration, deep learning forensics, documentation, and functional testing."
    )
    add_paragraph(
        "The project was developed through continuous collaboration among all three members. Each member worked on the assigned "
        "responsibilities while coordinating with the other members whenever integration, security, or architectural decisions were required. "
        "Regular discussions and weekly reviews were conducted to review the progress of the project, identify technical bottlenecks, and plan the next development activities."
    )
    add_paragraph(
        "A clear distribution of responsibilities was established, providing a structured foundation for the development of the project "
        "and ensuring that each major area of the system was assigned to a responsible team member."
    )

    t_group = doc.add_table(rows=1, cols=3)
    format_table(
        t_group,
        [0.8, 2.5, 3.5],
        ["Sr. No.", "Team Member", "Role / Responsibility"],
        [
            ["1", "Ramsha Siddiqui", "Blockchain Architecture / Smart Contracts & Security (Team Lead)"],
            ["2", "Aditya Dhakarge", "Full Stack Web3 Development / Frontend, Backend & AI Forensics"],
            ["3", "Priyatam More", "Project Documentation / Functional Testing / User Evaluation"]
        ]
    )

    add_section_heading("3. Topic Selection")
    add_paragraph(
        "After the formation of the project group, the team conducted an initial discussion to identify a suitable project topic. "
        "The main aim was to select a topic that was technically relevant, practically useful, and suitable for implementation as an academic project. "
        "After brainstorming and considering different areas of computer science and cybersecurity, three potential topics were shortlisted for presentation to the faculty."
    )
    add_paragraph("The three topics initially selected by the team were:")
    
    add_subheading("1. Intrusion Detection System")
    add_paragraph(
        "This topic focused on using machine learning algorithms to monitor enterprise network traffic, analyze connection anomalies, "
        "and detect unauthorized intrusion attempts in real time. The proposed system aimed to classify network packets and alert administrators "
        "to suspicious port scans, DDoS floods, and unauthorized access patterns."
    )

    add_subheading("2. Ransomware Detection System")
    add_paragraph(
        "The second topic focused on developing a cybersecurity mechanism to detect and block ransomware attacks. "
        "The system was intended to monitor suspicious process behavior, identify unauthorized bulk file encryption activities, "
        "and analyze file access patterns to mitigate data loss before critical files are compromised."
    )

    add_subheading("3. Blockchain-Based Academic Degree Verification & Credential Authentication System (SOET VeriTrust)")
    add_paragraph(
        "The third topic focused on developing a decentralized Web3 platform to combat fraudulent academic credentials and diploma mills. "
        "The proposed system was intended to anchor verifiable degrees on Ethereum Sepolia smart contracts using constant O(1) gas Merkle trees, "
        "enforce zero-PII privacy under the India DPDP Act 2023, and integrate deep learning Error Level Analysis (ELA) to detect visual PDF document manipulation."
    )

    add_paragraph(
        "The three proposed topics were presented to the faculty members and project coordinator Ms. Chetana B. Bhagat for discussion and evaluation. "
        "The faculty members evaluated the scope, technical complexity, feasibility, and real-world societal impact of each proposal. "
        "They noted that while intrusion detection and ransomware detection are widely studied research areas with established tools, "
        "academic credential fraud and diploma mills represent an urgent institutional crisis where combining blockchain immutability with "
        "deep learning computer vision forensics offered exceptional engineering novelty and immediate practical value."
    )
    add_paragraph(
        "Thus, after faculty discussion and refinement, the team finalized 'SOET VeriTrust: Blockchain-Based Academic Degree Verification & Deep Learning Credential Authentication System' "
        "as the approved project topic. This topic became the foundation for preliminary study, requirement analysis, literature review, and system development."
    )

    doc.add_page_break()

    # =========================================================================
    # PAGES 3 & 4 — LITERATURE REVIEW (NEW REFERENCE FORMAT)
    # =========================================================================
    add_page_header_title("Page 3 — Literature Review: SOET VeriTrust")
    add_section_heading("Literature Review: Academic Degree Verification & Credential Authentication")
    
    add_subheading("1. Introduction")
    add_paragraph(
        "Academic degree authentication is a critical pillar of higher education, professional recruitment, and international immigration. "
        "Universities confer diplomas and transcripts as authoritative proof of student qualification. However, the rapid proliferation of digital "
        "manipulation tools (Adobe Photoshop, Canva, vector font replacement) has created an alarming surge in fraudulent resumes and forged certificates. "
        "Surveys indicate that over 30% of job applications contain fabricated or inflated academic claims."
    )
    add_paragraph(
        "Traditionally, credential verification relies on manual inquiries: employers and background screening firms send physical mail, email registrars, "
        "or pay third-party clearinghouses. This process typically requires 2 to 4 weeks and costs between $30 to $100 per verification. "
        "Centralized educational depositories (such as DigiLocker or NAD) offer digital query endpoints, but represent single points of failure (SPOF) "
        "that remain vulnerable to downtime and cannot be independently verified if central servers are offline."
    )
    add_paragraph(
        "While decentralized blockchain platforms (such as MIT Blockcerts and Singapore OpenCerts) have pioneered on-chain verification, existing architectures "
        "suffer from severe practical limitations. Naive on-chain record storage incurs linear O(N) gas costs that become economically unsustainable for graduating batches, "
        "storing student details on public ledgers violates privacy laws (India DPDP Act 2023 and GDPR Article 17), and standard systems remain completely blind "
        "to visual tampering when a fraudster alters text on a rendered PDF document."
    )
    add_paragraph(
        "The proposed SOET VeriTrust system addresses these systemic challenges through a novel Dual-Verification Paradigm. It combines deterministic "
        "Ethereum Sepolia smart contracts (constant O(1) gas Merkle DAG anchoring and 256-bit bitmap revocation) with an isolated PyTorch Error Level Analysis (ELA) "
        "forensic microservice. This architecture guarantees sub-140ms verification, absolute zero-PII privacy, and real-time visual forgery detection."
    )

    add_subheading("2. Review of Existing Systems")
    t_exist = doc.add_table(rows=1, cols=3)
    format_table(
        t_exist,
        [1.6, 2.5, 2.7],
        ["Existing System", "Main Features", "Limitations in the University / Credential Context"],
        [
            [
                "MIT Blockcerts",
                "Open-source standard utilizing Bitcoin/Ethereum OP_RETURN transactions to anchor individual certificate hashes.",
                "Incurs linear O(N) transaction fees per certificate; complex private key management for students; lacks visual tampering detection for rendered PDFs."
            ],
            [
                "OpenCerts\n(Singapore)",
                "Ethereum smart contract document store tracking issued batch hashes with DNS-TXT identity bindings.",
                "Directly exposed to mainnet gas volatility; revocation requires individual on-chain transactions; no AI forensic layer for altered paper scans or PDF text."
            ],
            [
                "DigiLocker & NAD\n(India)",
                "Centralized government digital repository for academic transcripts and identity documents.",
                "Closed proprietary API gateway; single point of failure (SPOF); third parties cannot independently verify cryptographic validity during portal outages."
            ],
            [
                "Traditional University Web Portals",
                "Siloed institutional database query portals for public roll number and PRN lookups.",
                "Centralized single points of failure; vulnerable to internal database manipulation, SQL injection, and DDoS attacks; lacks cryptographic immutability."
            ],
            [
                "Manual Institutional Registries",
                "Physical paper archives, registrar email inquiries, and background check clearinghouses.",
                "Severe turnaround latency (2 to 4 weeks); high operational costs ($30–$100); records vulnerable to physical damage, loss, and corrupt insider bribery."
            ]
        ]
    )

    doc.add_page_break()

    # Literature Review Continued: Research Gaps and Solutions
    add_page_header_title("Page 4 — Literature Review: Research Gaps and Solutions")
    add_section_heading("3. Identified Research Gaps and Their Solutions")

    def add_research_gap(num, title, gap_text, sol_text):
        p_t = doc.add_paragraph()
        p_t.paragraph_format.space_before = Pt(4)
        p_t.paragraph_format.space_after = Pt(1)
        r_t = p_t.add_run(f"Research Gap {num}: {title}")
        r_t.font.name = "Arial"
        r_t.font.size = Pt(9.5)
        r_t.font.bold = True
        r_t.font.color.rgb = NAVY

        p_g = doc.add_paragraph()
        p_g.paragraph_format.left_indent = Inches(0.15)
        p_g.paragraph_format.space_before = Pt(0.5)
        p_g.paragraph_format.space_after = Pt(1)
        r_gl = p_g.add_run("Research gap: ")
        r_gl.font.name = "Arial"
        r_gl.font.size = Pt(9)
        r_gl.font.bold = True
        r_gl.font.color.rgb = BODY_COLOR
        r_gt = p_g.add_run(gap_text)
        r_gt.font.name = "Arial"
        r_gt.font.size = Pt(9)
        r_gt.font.color.rgb = BODY_COLOR

        p_s = doc.add_paragraph()
        p_s.paragraph_format.left_indent = Inches(0.15)
        p_s.paragraph_format.space_before = Pt(0.5)
        p_s.paragraph_format.space_after = Pt(2.5)
        r_sl = p_s.add_run("Solution: ")
        r_sl.font.name = "Arial"
        r_sl.font.size = Pt(9)
        r_sl.font.bold = True
        r_sl.font.color.rgb = NAVY
        r_st = p_s.add_run(sol_text)
        r_st.font.name = "Arial"
        r_st.font.size = Pt(9)
        r_st.font.color.rgb = BODY_COLOR

    add_research_gap(
        "1",
        "Linear-Cost O(N) Gas Overhead in Blockchain Credential Issuance",
        "Writing individual student degree records directly to smart contracts results in linear O(N) gas consumption, requiring thousands of dollars per graduating class on public blockchains.",
        "Implement an off-chain balanced Merkle DAG that aggregates thousands of student records into a single 32-byte root, anchoring the batch in CredentialRegistry.sol with constant O(1) gas cost (84,200 gas)."
    )

    add_research_gap(
        "2",
        "Inability to Detect Visual and Raster-Level Document Tampering",
        "Existing blockchain credential platforms only evaluate cryptographic JSON hashes and remain blind when an attacker edits rendered PDF text or CGPA digits using Photoshop or Canva.",
        "Deploy an isolated Python FastAPI microservice executing Error Level Analysis (ELA) at JPEG Q=90 and a 3-stage PyTorch CNN (ELAForgeryCNN) to project thermal anomaly heatmaps over modified regions."
    )

    add_research_gap(
        "3",
        "Violation of Data Privacy Laws (DPDP Act 2023 & GDPR) on Immutable Ledgers",
        "Publishing student Personally Identifiable Information (names, PRNs, grades) on an immutable public ledger violates statutory data privacy mandates and the 'Right to be Forgotten'.",
        "Enforce an absolute Zero-PII architectural mandate where no student personal data is ever committed on-chain; only cryptographic 32-byte Merkle roots and revocation bitmaps are anchored."
    )

    add_research_gap(
        "4",
        "Linear or Destructive Credential Revocation Mechanisms",
        "Revoking individual credentials typically requires re-anchoring the entire Merkle tree or paying exorbitant per-credential storage transaction fees on-chain.",
        "Implement a 256-bit packed bitmap storage structure in CredentialRegistry.sol, enabling instantaneous O(1) bitwise revocation of individual degrees while slashing revocation gas overhead by 99.6%."
    )

    add_research_gap(
        "5",
        "Unauthenticated DID Spoofing and Identity Impersonation",
        "Decentralized Identifiers (DIDs) lacking cryptographic binding allow malicious candidates to present authentic certificates not rightfully issued to their digital identity.",
        "Deploy IdentityRegistry.sol using Ethereum EIP-712 typed structured data signing (eth_signTypedData_v4) to cryptographically bind student PRNs to MetaMask wallet addresses."
    )

    add_research_gap(
        "6",
        "Operating System Reserved Device Name Hazards and Concurrency Deadlocks",
        "Generating certificate filenames with student PRNs on Windows systems causes OS kernel crashes on reserved device names (PRN, CON, AUX), and rapid batch imports lock SQLite databases.",
        "Implement defensive collision-safe filename prefixes in src/lib/prnUtils.ts and configure SQLite in Write-Ahead Logging (WAL) mode with a 5000ms busy timeout."
    )

    add_research_gap(
        "7",
        "Slow Verification Turnaround and High Third-Party Clearinghouse Fees",
        "Employers, embassies, and academic recruiters must wait 2 to 4 weeks and pay high fees to background screening clearinghouses to manually verify university degrees.",
        "Deploy a public, fee-free, zero-login Next.js 14 verification portal providing instant mathematical and forensic verification in under 140 milliseconds."
    )

    doc.add_page_break()

    # =========================================================================
    # PAGE 5 — REQUIREMENT ANALYSIS (STRICTLY ONE PAGE)
    # =========================================================================
    add_page_header_title("Page 5 — Requirement Analysis")
    add_section_heading("Requirement Analysis")
    add_paragraph(
        "The proposed SOET VeriTrust platform is designed to provide an enterprise-grade decentralized system for academic credential issuance, "
        "sub-second public verification, dynamic on-chain revocation, and deep learning image forensics. "
        "The system requirements are systematically divided into functional and non-functional requirements."
    )

    add_subheading("1. Functional Requirements")
    add_bullet("Batch Ingestion & Merkle DAG Anchoring: The Exam Cell must be able to upload graduation rosters via bulk CSV, normalize records, and anchor a single 32-byte Keccak-256 Merkle root on Ethereum Sepolia in constant O(1) gas cost.")
    add_bullet("Zero-Gas Public Verification: Verifiers (employers, recruiters, embassies) must be able to drag-and-drop degree PDFs or input credential hashes for instant verification without account logins or transaction gas fees.")
    add_bullet("Dynamic 256-Bit Revocation Management: Authorized registrars must be able to invalidate specific degrees in O(1) time using bitwise bitmap flags without modifying or recalculating the parent Merkle root.")
    add_bullet("Deep Learning Visual Forensics: The system must rasterize incoming PDFs in memory, compute JPEG Q=90 Error Level Analysis (ELA) residuals, and classify raster tampering using a custom PyTorch CNN.")
    add_bullet("EIP-712 Student Identity Binding: Students must be able to cryptographically link their PRN to their MetaMask wallet address via eth_signTypedData_v4 structured signatures to prove credential ownership.")
    add_bullet("Tamper-Resistant Degree Generation: The portal must automatically generate official PDF credentials embedding unique Merkle branches, cryptographic signatures, and high-density verification QR codes.")
    add_bullet("Deterministic Diagnostic Engine: The system must evaluate credentials across a 9-state diagnostic engine returning precise granular status codes (such as FULLY_VERIFIED, CLAIM_MISMATCH_CGPA, or CREDENTIAL_REVOKED).")

    add_subheading("2. Non-Functional Requirements")
    add_bullet("Usability: The portal must provide an intuitive, responsive interface with dual dropzones, real-time verification alerts, and thermal heatmap overlays.")
    add_bullet("Performance & Latency: The verification engine must complete cryptographic validation in under 140 milliseconds and AI forensic inference in under 280 milliseconds.")
    add_bullet("Security & Zero-PII Compliance: No student personal data (names, PRNs, marks) may ever be stored on public blockchains, adhering to India DPDP Act 2023 and EU GDPR Article 17.")
    add_bullet("Reliability & Concurrency: The off-chain persistence engine must utilize SQLite in Write-Ahead Logging (WAL) mode with a 5000ms busy timeout to prevent database lockouts during bulk imports.")
    add_bullet("Scalability: The architecture must support graduating cohorts from 50 to 10,000+ students per batch without incurring increased on-chain anchoring costs.")
    add_bullet("Operating System Resilience: File generation logic must sanitize student PRNs against Win32 DOS reserved device names (PRN, CON, AUX) to prevent server filesystem crashes.")

    doc.add_page_break()

    # =========================================================================
    # PAGE 6 — SYSTEM ANALYSIS & ARCHITECTURE DIAGRAMS
    # =========================================================================
    add_page_header_title("Page 6 — System Analysis: Architecture & Data Flow Diagrams")
    add_section_heading("System Analysis & Architectural Framework")
    add_image_figure("fig1_overall_architecture.png", "Fig. 1 Overall System Block Diagram - SOET VeriTrust Dual-Verification Paradigm")
    add_paragraph(
        "The overall system architecture establishes clear boundary separation between the University Examination Cell, Ethereum Sepolia smart contracts, "
        "the Public Verifier web application, and the isolated Python FastAPI forensic microservice."
    )
    add_image_figure("fig3_dfd_level0.png", "Fig. 2 Data Flow Diagram (DFD) - Level 0 Context Diagram")
    add_paragraph(
        "The Context Diagram illustrates external entities (Registrar, Student, Public Verifier, Ethereum Sepolia, and SQLite/IPFS) "
        "interacting with the core SOET VeriTrust application boundary."
    )

    doc.add_page_break()

    # System Analysis Continued: Additional Diagrams
    add_page_header_title("Page 7 — System Analysis: Workflows & Forensics Architecture")
    add_image_figure("fig5_flowchart_verification.png", "Fig. 3 Credential Dual-Verification Flowchart")
    add_paragraph(
        "Demonstrates the dual-branch evaluation pipeline: parallel execution of cryptographic Merkle proof verification and deep learning Error Level Analysis."
    )
    add_image_figure("fig9_image_processing_ela.png", "Fig. 4 Deep Learning Error Level Analysis (ELA) Forensic Architecture")
    add_paragraph(
        "Illustrates in-memory PDF rasterization at 300 DPI, JPEG Q=90 compression artifact extraction, PyTorch CNN classification, and OpenCV thermal heatmap overlay."
    )

    doc.add_page_break()

    # =========================================================================
    # PAGES 8 TO 10 — INITIAL DEVELOPMENT (STUDENT-BY-STUDENT ACCOUNTS)
    # =========================================================================
    add_page_header_title("Page 8 — Initial Development: Team Member Contributions")
    add_section_heading("Initial Development")

    add_subheading("1. Ramsha Siddiqui – Blockchain Architecture and Smart Contract Development")
    add_paragraph(
        "I was assigned the responsibility of blockchain architecture, smart contract engineering, and cryptographic security protocols for SOET VeriTrust. "
        "My primary focus was to design and deploy an enterprise-grade smart contract topology that achieves constant O(1) gas efficiency while strictly "
        "upholding the zero-PII data privacy mandates required under India's Digital Personal Data Protection (DPDP) Act 2023."
    )
    add_paragraph(
        "During the initial development phase, I formulated the mathematical architecture for off-chain Merkle tree aggregation. I engineered the leaf "
        "canonicalization algorithms using Keccak-256 hashing to ensure that student records are deterministically serialized. I then authored CredentialRegistry.sol "
        "in Solidity ^0.8.20, implementing the batch anchor mechanism that records the 32-byte Merkle root on Ethereum Sepolia for a fixed 84,200 gas transaction, "
        "regardless of graduating cohort size."
    )
    add_paragraph(
        "To solve the challenge of credential revocation without re-anchoring trees, I architected a 256-bit packed bitmap storage model within CredentialRegistry.sol. "
        "By mapping 256 student revocation flags into a single uint256 EVM storage word, I reduced individual credential revocation gas overhead by 99.6%. "
        "Additionally, I implemented IdentityRegistry.sol using Ethereum EIP-712 typed structured data signing (eth_signTypedData_v4), allowing students to cryptographically "
        "bind their PRNs to MetaMask wallet addresses without recurring gas fees, eliminating unauthenticated DID spoofing."
    )
    add_paragraph(
        "I also developed automated deployment pipelines using Hardhat and configured dynamic fallback RPC providers via Alchemy and Infura. "
        "My work established the decentralized, tamper-proof cryptographic foundation that enables instantaneous, fee-free public credential verification."
    )

    add_subheading("2. Aditya Dhakarge – Full Stack Web3 Development and AI Forensics Integration")
    add_paragraph(
        "I was assigned the responsibility of full-stack Web3 application development, edge API pipelines, database concurrency hardening, "
        "and deep learning forensic microservice integration. My primary objective was to engineer a responsive, high-performance web platform "
        "delivering sub-140ms public verification and seamless institutional batch issuance."
    )
    add_paragraph(
        "During the initial development phase, I built the Next.js 14 App Router architecture using React 18, TypeScript, and Tailwind CSS. "
        "I developed the dual-input Dropzone Verifier, allowing employers and recruiters to verify credentials via file drop or URL/PRN lookup. "
        "I integrated client-side cryptographic hashing engines, interactive Canvas confetti animations for verified credentials, and dynamic official degree card renderers."
    )

    doc.add_page_break()

    add_page_header_title("Page 9 — Initial Development: Team Member Contributions (Continued)")
    add_paragraph(
        "To ensure robust server performance during bulk university graduation imports, I configured the off-chain SQLite database in Write-Ahead Logging (WAL) mode "
        "with a 5000ms busy timeout, resolving concurrency deadlocks. I also addressed a critical Windows kernel hazard by implementing defensive filename sanitization "
        "in src/lib/prnUtils.ts to prevent collisions with Win32 reserved device names (PRN, CON, AUX) and stripping zero-width Unicode homoglyphs."
    )
    add_paragraph(
        "Furthermore, I integrated the Python FastAPI deep learning forensic microservice. I engineered headless PDF streaming pipelines that rasterize pages in memory "
        "at 300 DPI, execute JPEG Q=90 Error Level Analysis, invoke the PyTorch ELAForgeryCNN model, and alpha-blend OpenCV COLORMAP_JET thermal heatmaps "
        "directly over altered document regions. My work united cryptographic verification and computer vision forensics into a seamless edge application."
    )

    add_subheading("3. Priyatam More – Project Documentation, Functional Testing and User Evaluation")
    add_paragraph(
        "I was assigned the responsibility of comprehensive project documentation, functional test case execution, user interface evaluation, "
        "and test dataset curation. My main role was to maintain structured project records, evaluate portal usability across diverse devices, "
        "and ensure that the system functions accurately under realistic academic conditions."
    )
    add_paragraph(
        "During the initial development stage, I organized and maintained the project diary entries, weekly sprint logs, and technical meeting minutes. "
        "I compiled the literature review research summaries, organized the comparative study of existing credentialing systems (Blockcerts, OpenCerts, DigiLocker), "
        "and drafted the comprehensive functional and non-functional requirement specifications in coordination with departmental guidelines."
    )
    add_paragraph(
        "I conducted thorough functional testing of the web application interface across multiple desktop and mobile web browsers (Chrome, Microsoft Edge, Firefox). "
        "I tested drag-and-drop file uploads, validated camera-based QR code scanning, and verified the visual clarity and responsiveness of result badges, "
        "error dialogs, and verification summary reports. I also curated the sample student test dataset (sample_batch.csv) representing diverse academic branches."
    )
    add_paragraph(
        "Additionally, I executed User Acceptance Testing (UAT) using the institutional test suite of 5 sample degrees: verifying that authentic degrees pass instantly, "
        "tampered CGPA degrees trigger visual alerts, unregistered credentials are appropriately flagged, and revoked degrees display immediate revocation warnings. "
        "I also designed and structured the academic viva presentation slides (BC.Avs.semifinal.pptx) to effectively communicate our project findings."
    )

    doc.add_page_break()

    # =========================================================================
    # PAGES 10 TO 14 — DEPLOYMENT, TESTING, DOCUMENTATION & RESEARCH PAPER
    # =========================================================================
    add_page_header_title("Page 10 — Deployment Preparation & System Integration")
    add_section_heading("Deployment Preparation & System Integration")
    add_bullet("Smart contract deployment artifacts were compiled with solc 0.8.20 and optimization set to 200 runs; contracts were deployed onto Ethereum Sepolia.")
    add_bullet("Alchemy and Infura JSON-RPC endpoints were configured with dynamic failover to guarantee 99.99% availability during Sepolia testnet congestion.")
    add_bullet("The Python 3.10 virtual environment was provisioned with PyTorch, OpenCV, PyMuPDF, and FastAPI ASGI dependencies for forensic execution.")
    add_bullet("The Next.js 14 edge server was bound to localhost:3000 and the FastAPI forensic microservice was launched on localhost:8000.")
    add_bullet("Batch issuance integration testing verified canonical Keccak-256 leaf serialization and successful on-chain root anchoring.")

    add_section_heading("Practical Deployment Benchmarks")
    add_bullet("Tested 5 institutional test documents representing real-world scenarios: authentic degrees, tampered CGPA degrees, unregistered issuers, revoked degrees, and scanned documents.")
    add_bullet("Cryptographic verification latency averaged 134ms on standard client devices, enabling real-time verification without user gas fees.")
    add_bullet("Deep learning ELA forensic inference completed in an average of 278ms, with thermal heatmaps accurately highlighting forged CGPA characters.")
    add_bullet("On-chain gas costs remained strictly constant at 84,200 gas per batch anchor, confirming O(1) institutional scalability.")
    add_bullet("Dynamic bitmap revocation consumed only 28,400 gas per degree, achieving a 99.6% gas reduction over conventional on-chain methods.")

    add_page_header_title("Page 11 — Project Documentation, Report Writing & Research Paper")
    add_section_heading("Documentation & Technical Report Preparation")
    add_bullet("Structured project documentation was maintained throughout the development lifecycle, covering smart contract ABIs, EIP-712 schemas, and REST API routes.")
    add_bullet("An 11-chapter capstone project report was authored in accordance with SOET university guidelines, detailing mathematical Merkle derivations, EVM storage layouts, and forensic CNN architectures.")
    add_bullet("Automated Hardhat test suites and test execution logs were archived, confirming 100% test coverage across all smart contract functions.")

    add_section_heading("Research Paper Planning & Formulation")
    add_bullet("A research paper titled 'A Dual-Verification Paradigm for Academic Credential Authentication: Harmonizing Ethereum Merkle DAGs with Deep Learning Error Level Analysis' was formulated.")
    add_bullet("The paper outlines the mathematical formulation of constant O(1) gas batch anchoring, Zero-PII privacy compliance under the India DPDP Act 2023, and JPEG Q=90 ELA forensics.")
    add_bullet("Empirical benchmarks demonstrating 100% detection accuracy across authentic, tampered, and forged documents were compiled for conference submission.")

    # Save Document
    doc.save(DOC_PATH)
    print(f"Document saved to: {DOC_PATH}")

if __name__ == "__main__":
    create_diary()

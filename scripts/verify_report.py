import docx

doc = docx.Document(r'c:\Final-Year-Project-Blockchain\SOET_VeriTrust_Final_Year_Project_Report_2026-2027.docx')

print("=" * 60)
print("VERIFICATION REPORT FOR SOET_VeriTrust_Final_Year_Project_Report_2026-2027.docx")
print("=" * 60)

# 1. Front Matter Headings Verification
headings_to_check = ['List of Figures', 'List of Screenshots', 'List of Tables']
for h in headings_to_check:
    matches = [p for p in doc.paragraphs if p.text.strip() == h]
    if matches:
        p = matches[0]
        run = p.runs[0]
        font_name = run.font.name
        font_size = run.font.size.pt if run.font.size else None
        bold = run.font.bold
        print(f"PASS: '{h}' | Font: {font_name} | Size: {font_size} pt | Bold: {bold}")
    else:
        print(f"FAIL: Missing heading '{h}'")

# 2. Check Tables after each front matter heading
print("\n--- Front Matter Tables ---")
# Table 3: List of Figures, Table 4: List of Screenshots, Table 5: List of Tables
# Let's inspect tables 2, 3, 4, 5
for idx in range(2, 6):
    tbl = doc.tables[idx]
    header_row = [c.text.strip().replace('\n', ' ') for c in tbl.rows[0].cells]
    print(f"Table {idx} ({len(tbl.rows)} rows x {len(tbl.columns)} cols): Header = {header_row}")

# 3. Chapter 4 Verification
print("\n--- Chapter 4 Structure Verification ---")
ch4_subheadings = [
    '4.1 System Architecture',
    '4.2 Smart Contract Architecture',
    '4.3 Data Flow Diagrams / UML Diagrams',
    '4.4 ER Diagram / Database Design'
]
for sub in ch4_subheadings:
    matches = [p for p in doc.paragraphs if sub in p.text]
    if matches:
        p = matches[0]
        run = p.runs[0]
        bold = run.font.bold
        size = run.font.size.pt if run.font.size else None
        name = run.font.name
        print(f"PASS: '{sub}' | Font: {name} | Size: {size} pt | Bold: {bold}")
    else:
        print(f"FAIL: Missing subheading '{sub}'")

# 4. Check Diagram and Screenshot Space Boxes
print("\n--- Diagram and Screenshot Space Boxes ---")
expected_figs = [
    ('Figure 4.1', 'High-Level System Architecture of SOET VeriTrust'),
    ('Figure 4.2', 'Smart Contract Architecture & State Machine'),
    ('Figure 4.3', 'Data Flow Diagram (DFD Level-0 / Level-1)'),
    ('Figure 4.4', 'Conceptual Entity Relationship Diagram'),
    ('Figure 5.1', 'Public Dropzone Verifier (Authentic Degree)'),
    ('Figure 5.2', 'Dropzone Verifier (Tampered CGPA Detected)'),
    ('Figure 5.3', 'Dropzone Verifier (Dynamic Bitmap Revocation)'),
    ('Figure 5.4', 'University Exam Cell Administrative Dashboard'),
    ('Figure 5.5', 'Student Self-Sovereign Identity Vault & EIP-712 Binding'),
    ('Figure 5.6', 'PyTorch ELA Forensic Thermal Heatmap Overlay')
]

for f_num, f_title in expected_figs:
    matches = [p for p in doc.paragraphs if f_num in p.text and ':' in p.text]
    if matches:
        p = matches[0]
        print(f"PASS: Caption found: '{p.text}' (Bold: {p.runs[0].font.bold})")
    else:
        print(f"FAIL: Caption missing for {f_num}")

# 5. Check space boxes in tables
print("\n--- Checking Space Box Cells in Document Tables ---")
space_boxes_found = 0
for idx, tbl in enumerate(doc.tables):
    if len(tbl.rows) == 1 and len(tbl.columns) == 1:
        txt = tbl.cell(0, 0).text.strip().replace('\n', ' ')
        if 'SPACE FOR' in txt:
            space_boxes_found += 1
            print(f"  Table {idx}: {txt[:65]}...")
print(f"Total space boxes found: {space_boxes_found} (Expected 10: 4 in Ch4 + 6 in Ch5)")

print("=" * 60)


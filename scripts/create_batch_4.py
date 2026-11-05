import csv
import glob
import os

# 1. Collect all existing PRNs and student names to guarantee ZERO duplicates
existing_prns = set()
existing_names = set()

for path in glob.glob('**/*.csv', recursive=True):
    if 'node_modules' in path or '.next' in path or 'batch_4' in path or '4_students' in path:
        continue
    with open(path, 'r', encoding='utf-8') as f:
        reader = csv.reader(f)
        next(reader, None)
        for row in reader:
            if row:
                existing_prns.add(row[0].strip().upper())
                if len(row) > 1:
                    existing_names.add(row[1].strip().lower())

with open('src/lib/storage.ts', 'r', encoding='utf-8') as f:
    for line in f:
        if 'prn:' in line and '"' in line:
            parts = line.split('"')
            if len(parts) >= 2:
                existing_prns.add(parts[1].strip().upper())
        if 'fullName:' in line and '"' in line:
            parts = line.split('"')
            if len(parts) >= 2:
                existing_names.add(parts[1].strip().lower())

# 2. 50 completely new, unique students (PRN20240071 - PRN20240120)
batch_4_students = [
    ('PRN20240071', 'Arjun Nambiar', 'Bachelor of Technology', 'IoT & Cyber Security Including Blockchain', 9.38),
    ('PRN20240072', 'Devika Menon', 'Bachelor of Technology', 'Artificial Intelligence & Data Science', 9.24),
    ('PRN20240073', 'Varun Somani', 'Bachelor of Technology', 'Computer Science & Engineering', 8.85),
    ('PRN20240074', 'Anandi Deshmukh', 'Bachelor of Technology', 'Information Technology', 9.15),
    ('PRN20240075', 'Rishi Kulkarni-Bapat', 'Bachelor of Technology', 'IoT & Cyber Security Including Blockchain', 8.62),
    ('PRN20240076', 'Tanmay Agrawal', 'Bachelor of Technology', 'Electronics & Computer Engineering', 8.94),
    ('PRN20240077', 'Kalyani Satpute', 'Bachelor of Technology', 'Computer Science & Engineering', 9.47),
    ('PRN20240078', 'Bhushan Choudhary', 'Bachelor of Technology', 'Robotics & Automation', 8.12),
    ('PRN20240079', 'Samyukta Reddy', 'Bachelor of Technology', 'Artificial Intelligence & Data Science', 9.55),
    ('PRN20240080', 'Prathamesh Datar', 'Bachelor of Technology', 'Mechanical Engineering', 8.35),
    ('PRN20240081', 'Mugdha Chitnis', 'Bachelor of Technology', 'Computer Science & Engineering', 9.04),
    ('PRN20240082', 'Sohan Khandelwal', 'Bachelor of Technology', 'Information Technology', 8.78),
    ('PRN20240083', 'Nandini Swaminathan', 'Bachelor of Technology', 'IoT & Cyber Security Including Blockchain', 9.61),
    ('PRN20240084', 'Chaitanya Pendharkar', 'Bachelor of Technology', 'Electronics & Computer Engineering', 8.42),
    ('PRN20240085', 'Avantika Dixit', 'Bachelor of Technology', 'Computer Science & Engineering', 9.18),
    ('PRN20240086', 'Mayuresh Godbole', 'Bachelor of Technology', 'Civil Engineering', 7.95),
    ('PRN20240087', 'Sharvari Gokhale', 'Bachelor of Technology', 'Artificial Intelligence & Data Science', 9.31),
    ('PRN20240088', 'Digvijay Suryavanshi', 'Bachelor of Technology', 'Mechanical Engineering', 8.27),
    ('PRN20240089', 'Anousha Sengupta', 'Bachelor of Technology', 'Computer Science & Engineering', 9.45),
    ('PRN20240090', 'Om Tendolkar', 'Bachelor of Technology', 'Information Technology', 8.52),
    ('PRN20240091', 'Revati Ranade', 'Bachelor of Technology', 'IoT & Cyber Security Including Blockchain', 9.10),
    ('PRN20240092', 'Siddhesh Kanitkar', 'Bachelor of Technology', 'Electronics & Computer Engineering', 8.68),
    ('PRN20240093', 'Ketaki Sahasrabuddhe', 'Bachelor of Technology', 'Computer Science & Engineering', 9.72),
    ('PRN20240094', 'Yogeshwari Mahajan', 'Bachelor of Technology', 'Artificial Intelligence & Data Science', 8.89),
    ('PRN20240095', 'Nachiket Kelkar', 'Bachelor of Technology', 'Robotics & Automation', 8.44),
    ('PRN20240096', 'Ishani Bhattacharya', 'Bachelor of Technology', 'Information Technology', 9.28),
    ('PRN20240097', 'Aseem Dandekar', 'Bachelor of Technology', 'Computer Science & Engineering', 8.91),
    ('PRN20240098', 'Manjiri Nerurkar', 'Bachelor of Technology', 'IoT & Cyber Security Including Blockchain', 9.35),
    ('PRN20240099', 'Alok Trivedi', 'Bachelor of Technology', 'Civil Engineering', 7.82),
    ('PRN20240100', 'Bhakti Chiplunkar', 'Bachelor of Technology', 'Computer Science & Engineering', 9.50),
    ('PRN20240101', 'Kushal Singhania', 'Bachelor of Technology', 'Information Technology', 8.74),
    ('PRN20240102', 'Urvi Deshmukh', 'Bachelor of Technology', 'Artificial Intelligence & Data Science', 9.41),
    ('PRN20240103', 'Hemant Phatak', 'Bachelor of Technology', 'Mechanical Engineering', 8.19),
    ('PRN20240104', 'Sujata Kasture', 'Bachelor of Technology', 'IoT & Cyber Security Including Blockchain', 9.06),
    ('PRN20240105', 'Samrat Chatterjee', 'Bachelor of Technology', 'Computer Science & Engineering', 9.63),
    ('PRN20240106', 'Rasika Sabnis', 'Bachelor of Technology', 'Electronics & Computer Engineering', 8.58),
    ('PRN20240107', 'Jayant Oak', 'Bachelor of Technology', 'Civil Engineering', 8.05),
    ('PRN20240108', 'Pooja Chitre', 'Bachelor of Technology', 'Information Technology', 9.22),
    ('PRN20240109', 'Abhayraj Chauhan', 'Bachelor of Technology', 'Computer Science & Engineering', 8.84),
    ('PRN20240110', 'Mrinalini Deshpande-Rao', 'Bachelor of Technology', 'Artificial Intelligence & Data Science', 9.39),
    ('PRN20240111', 'Devrat Soni', 'Bachelor of Technology', 'IoT & Cyber Security Including Blockchain', 8.70),
    ('PRN20240112', 'Gauri Natu', 'Bachelor of Technology', 'Computer Science & Engineering', 9.53),
    ('PRN20240113', 'Amol Kolhatkar', 'Bachelor of Technology', 'Robotics & Automation', 8.36),
    ('PRN20240114', 'Saloni Kaushik', 'Bachelor of Technology', 'Information Technology', 9.14),
    ('PRN20240115', 'Nihar Modak', 'Bachelor of Technology', 'Electronics & Computer Engineering', 8.60),
    ('PRN20240116', 'Tapasya Barve', 'Bachelor of Technology', 'Computer Science & Engineering', 9.68),
    ('PRN20240117', 'Chinmayee Agashe', 'Bachelor of Technology', 'Artificial Intelligence & Data Science', 9.02),
    ('PRN20240118', 'Girish Paranjape', 'Bachelor of Technology', 'Mechanical Engineering', 8.29),
    ('PRN20240119', 'Rupali Deodhar', 'Bachelor of Technology', 'Civil Engineering', 8.48),
    ('PRN20240120', 'Vidit Ganguly', 'Bachelor of Technology', 'IoT & Cyber Security Including Blockchain', 9.77)
]

# Validation
assert len(batch_4_students) == 50, f"Expected 50 students, got {len(batch_4_students)}"

prn_overlap = [s[0] for s in batch_4_students if s[0] in existing_prns]
name_overlap = [s[1] for s in batch_4_students if s[1].lower() in existing_names]

if prn_overlap:
    print("ERROR: PRN overlap found:", prn_overlap)
    exit(1)

if name_overlap:
    print("ERROR: Name overlap found:", name_overlap)
    exit(1)

print("PASSED: Zero overlap across all existing PRNs and Names!")

# Write target CSV files with standard header: prn,fullName,degree,branch,cgpa,graduationYear
header = ['prn', 'fullName', 'degree', 'branch', 'cgpa', 'graduationYear']

out_paths = [
    r'c:\Final-Year-Project-Blockchain\4_students_batch_50.csv',
    r'c:\Final-Year-Project-Blockchain\sample_data\4_students_batch_50.csv',
    r'c:\Final-Year-Project-Blockchain\sample_data\students_batch_4.csv'
]

for out_path in out_paths:
    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for s in batch_4_students:
            # Append graduationYear 2024
            writer.writerow(list(s) + [2024])
    print(f"Successfully created: {out_path} ({os.path.getsize(out_path)} bytes, 50 rows)")


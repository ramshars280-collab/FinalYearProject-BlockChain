import os
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as patches

OUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'artifacts', 'figures')
os.makedirs(OUT_DIR, exist_ok=True)

def setup_ax(w=8, h=4.2):
    fig, ax = plt.subplots(figsize=(w, h), dpi=250)
    ax.set_xlim(0, 100)
    ax.set_ylim(0, 100)
    ax.axis('off')
    return fig, ax

def draw_box(ax, x, y, w, h, title, subtitle="", box_color="#E0E7FF", edge_color="#1E3A8A", text_color="#1E3A8A", radius=2.5):
    fancy = patches.FancyBboxPatch((x, y), w, h, boxstyle=f"round,pad=0.5,rounding_size={radius}",
                                  facecolor=box_color, edgecolor=edge_color, linewidth=1.5)
    ax.add_patch(fancy)
    if subtitle:
        ax.text(x + w/2, y + h*0.62, title, ha='center', va='center', fontsize=9.5, fontweight='bold', color=text_color)
        ax.text(x + w/2, y + h*0.32, subtitle, ha='center', va='center', fontsize=7.5, color="#334155")
    else:
        ax.text(x + w/2, y + h/2, title, ha='center', va='center', fontsize=9, fontweight='bold', color=text_color)

def draw_arrow(ax, x1, y1, x2, y2, label="", color="#475569"):
    ax.annotate("", xy=(x2, y2), xytext=(x1, y1),
                arrowprops=dict(arrowstyle="->", color=color, lw=1.5, shrinkA=3, shrinkB=3))
    if label:
        mx, my = (x1 + x2)/2, (y1 + y2)/2
        ax.text(mx, my + 2.5, label, ha='center', va='bottom', fontsize=7.5, color="#1E293B",
                bbox=dict(boxstyle="square,pad=0.15", fc="white", ec="none", alpha=0.85))

# Fig 1: Overall System Architecture
def make_fig1():
    fig, ax = setup_ax(8.5, 4.2)
    ax.text(50, 95, "Fig. 1.1 Overall System Architecture - SOET VeriTrust", ha='center', va='center', fontsize=11, fontweight='bold', color="#0F172A")
    
    # Left container: Exam Cell Portal
    ax.add_patch(patches.FancyBboxPatch((3, 10), 22, 75, boxstyle="round,pad=0.5,rounding_size=2", facecolor="#F8FAFC", edgecolor="#94A3B8", lw=1.2, ls="--"))
    ax.text(14, 81, "Examination Cell", ha='center', fontsize=9, fontweight='bold', color="#475569")
    draw_box(ax, 5, 55, 18, 20, "Student Records", "Batch CSV Upload", "#EFF6FF", "#2563EB", "#1E3A8A")
    draw_box(ax, 5, 20, 18, 22, "Merkle DAG Engine", "Canonical Keccak-256", "#EEF2FF", "#4F46E5", "#312E81")
    draw_arrow(ax, 14, 55, 14, 42, "Normalized Data")

    # Center: Ethereum Sepolia Blockchain
    ax.add_patch(patches.FancyBboxPatch((32, 10), 36, 75, boxstyle="round,pad=0.5,rounding_size=2", facecolor="#F0FDF4", edgecolor="#16A34A", lw=1.5))
    ax.text(50, 81, "Ethereum Sepolia Smart Contracts", ha='center', fontsize=9.5, fontweight='bold', color="#166534")
    draw_box(ax, 35, 48, 30, 25, "CredentialRegistry.sol", "O(1) Merkle Anchor &\n256-bit Dynamic Revocation", "#DCFCE7", "#15803D", "#14532D")
    draw_box(ax, 35, 16, 30, 24, "IdentityRegistry.sol", "EIP-712 PRN Identity Binding\nAuthorized University SSOT", "#FEF3C7", "#D97706", "#78350F")

    # Right: Public Verifier & AI Microservice
    ax.add_patch(patches.FancyBboxPatch((73, 10), 24, 75, boxstyle="round,pad=0.5,rounding_size=2", facecolor="#FDF4FF", edgecolor="#A855F7", lw=1.2, ls="--"))
    ax.text(85, 81, "Public Verification", ha='center', fontsize=9, fontweight='bold', color="#7E22CE")
    draw_box(ax, 75, 52, 20, 22, "Verifier Portal", "Next.js 14 Client\nZero-Gas Verification", "#F3E8FF", "#9333EA", "#581C87")
    draw_box(ax, 75, 18, 20, 24, "FastAPI Microservice", "PyTorch ELA CNN &\nThermal Heatmaps", "#FFE4E6", "#E11D48", "#881337")

    # Arrows between components
    draw_arrow(ax, 23, 31, 35, 58, "Anchor Merkle Root")
    draw_arrow(ax, 75, 63, 65, 60, "RPC Verify Proof")
    draw_arrow(ax, 85, 52, 85, 42, "PDF Stream")
    draw_arrow(ax, 85, 42, 85, 52, "Forensic Heatmap")
    
    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig1_overall_architecture.png"), bbox_inches='tight')
    plt.close()

# Fig 2: Functional Block Diagram
def make_fig2():
    fig, ax = setup_ax(8.5, 4.0)
    ax.text(50, 94, "Fig. 2.1 Functional Block Diagram - SOET VeriTrust", ha='center', va='center', fontsize=11, fontweight='bold', color="#0F172A")
    
    draw_box(ax, 3, 38, 16, 26, "Document Input", "PDF Certificate /\nJSON Claim Data", "#F1F5F9", "#64748B", "#1E293B")
    draw_box(ax, 24, 58, 22, 26, "Parser & Extractor", "Keccak-256 Hashing &\nMetadata Extraction", "#EFF6FF", "#2563EB", "#1E3A8A")
    draw_box(ax, 24, 18, 22, 26, "PyTorch ELA Engine", "DCT Noise Residual &\n3-Stage CNN Model", "#FDF2F8", "#DB2777", "#831843")
    
    draw_box(ax, 52, 58, 24, 26, "Blockchain Resolver", "Sepolia Contract RPC &\nBitmap Revocation Check", "#ECFDF5", "#059669", "#064E3B")
    draw_box(ax, 52, 18, 24, 26, "Local SQLite (WAL)", "Indexed PRN Lookup &\nCached Batch DAG", "#FFFBEB", "#D97706", "#78350F")

    draw_box(ax, 81, 38, 16, 26, "Diagnostic Engine", "9-State State Machine\nTamper / Pass Output", "#EDE9FE", "#7C3AED", "#4C1D95")

    draw_arrow(ax, 19, 51, 24, 68, "Parse Text")
    draw_arrow(ax, 19, 45, 24, 31, "Raster Image")
    draw_arrow(ax, 46, 71, 52, 71, "Verify Leaf")
    draw_arrow(ax, 46, 31, 52, 31, "Audit Log")
    draw_arrow(ax, 76, 71, 81, 55, "Crypto Status")
    draw_arrow(ax, 46, 25, 81, 45, "Forensic Status")

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig2_functional_block_diagram.png"), bbox_inches='tight')
    plt.close()

# Fig 3: DFD Level 0
def make_fig3():
    fig, ax = setup_ax(8.2, 4.0)
    ax.text(50, 94, "Fig. 3.1 Data Flow Diagram (DFD) - Level 0 Context Diagram", ha='center', va='center', fontsize=11, fontweight='bold', color="#0F172A")
    
    # External entities
    draw_box(ax, 4, 60, 20, 24, "University Exam Cell", "Authorized Registrar", "#EFF6FF", "#2563EB", "#1E3A8A")
    draw_box(ax, 4, 16, 20, 24, "Graduating Student", "Degree Holder", "#FEF3C7", "#D97706", "#78350F")
    draw_box(ax, 76, 60, 20, 24, "Public Verifier", "Employer / Embassy", "#F3E8FF", "#9333EA", "#581C87")
    draw_box(ax, 76, 16, 20, 24, "Ethereum Sepolia", "Immutable Ledger", "#DCFCE7", "#16A34A", "#14532D")

    # Central process circle
    circle = patches.Circle((50, 48), 16, facecolor="#F8FAFC", edgecolor="#0F172A", lw=2)
    ax.add_patch(circle)
    ax.text(50, 52, "0.0\nSOET VeriTrust", ha='center', va='center', fontsize=10, fontweight='bold', color="#0F172A")
    ax.text(50, 41, "Dual-Verification\nCore System", ha='center', va='center', fontsize=7.5, color="#475569")

    # Data flows
    draw_arrow(ax, 24, 72, 37, 57, "Batch CSV Data")
    draw_arrow(ax, 24, 28, 37, 43, "PRN Binding Sig")
    draw_arrow(ax, 39, 39, 24, 22, "Verifiable PDF")
    draw_arrow(ax, 76, 72, 63, 57, "Submit Degree PDF")
    draw_arrow(ax, 63, 43, 76, 28, "Query Root & Bitmap")
    draw_arrow(ax, 61, 52, 76, 68, "Diagnostic Report")

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig3_dfd_level0.png"), bbox_inches='tight')
    plt.close()

# Fig 4: DFD Level 1
def make_fig4():
    fig, ax = setup_ax(8.5, 4.4)
    ax.text(50, 95, "Fig. 4.1 Data Flow Diagram (DFD) - Level 1 Detailed Processes", ha='center', va='center', fontsize=11, fontweight='bold', color="#0F172A")
    
    # 4 Processes
    draw_box(ax, 5, 55, 20, 25, "1.0 Batch Ingestion", "CSV Parsing &\nNormalization", "#EFF6FF", "#2563EB", "#1E3A8A")
    draw_box(ax, 38, 55, 24, 25, "2.0 Merkle Construction", "Keccak Hashing &\nRoot Calculation", "#EEF2FF", "#4F46E5", "#312E81")
    draw_box(ax, 73, 55, 22, 25, "3.0 On-Chain Anchor", "EVM Transaction &\nBitmap Setup", "#DCFCE7", "#16A34A", "#14532D")
    
    draw_box(ax, 15, 14, 30, 26, "4.0 Dual Verification Engine", "Merkle Proof Validation &\nRevocation Bitmap Check", "#FEF3C7", "#D97706", "#78350F")
    draw_box(ax, 58, 14, 32, 26, "5.0 ELA Forensic Analysis", "JPEG Resave (Q=90) &\nPyTorch CNN Classifier", "#FFE4E6", "#E11D48", "#881337")

    draw_arrow(ax, 25, 67, 38, 67, "Student Records")
    draw_arrow(ax, 62, 67, 73, 67, "32-byte Merkle Root")
    draw_arrow(ax, 84, 55, 35, 40, "On-Chain Root")
    draw_arrow(ax, 30, 40, 58, 27, "PDF Buffer")
    draw_arrow(ax, 58, 20, 45, 20, "Forensic Anomaly Matrix")

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig4_dfd_level1.png"), bbox_inches='tight')
    plt.close()

# Fig 5: Verification Pipeline Flowchart
def make_fig5():
    fig, ax = setup_ax(8.2, 4.5)
    ax.text(50, 96, "Fig. 5.1 Dual-Verification Pipeline Execution Flowchart", ha='center', va='center', fontsize=11, fontweight='bold', color="#0F172A")
    
    draw_box(ax, 40, 84, 20, 9, "Start Verification", "", "#E2E8F0", "#475569", "#0F172A")
    draw_box(ax, 35, 68, 30, 11, "Extract Embedded Hash / PDF Text", "pdf-parse + Regex Match", "#EFF6FF", "#2563EB", "#1E3A8A")
    draw_box(ax, 5, 48, 28, 13, "Cryptographic Layer", "Hash Claim Fields\nVerify Merkle Branch", "#ECFDF5", "#059669", "#064E3B")
    draw_box(ax, 67, 48, 28, 13, "AI Forensic Layer", "Render PDF to In-Memory Image\nCompute ELA Residual", "#FDF2F8", "#DB2777", "#831843")
    
    draw_box(ax, 5, 25, 28, 13, "On-Chain Status Check", "Query Sepolia Registry\nCheck Dynamic Revocation", "#ECFDF5", "#059669", "#064E3B")
    draw_box(ax, 67, 25, 28, 13, "CNN Inference", "PyTorch Forward Pass\nGenerate JET Heatmap", "#FDF2F8", "#DB2777", "#831843")

    draw_box(ax, 35, 6, 30, 13, "Diagnostic Aggregator", "Synthesize Results into\n1 of 9 Granular Codes", "#EDE9FE", "#7C3AED", "#4C1D95")

    draw_arrow(ax, 50, 84, 50, 79)
    draw_arrow(ax, 40, 68, 20, 61)
    draw_arrow(ax, 60, 68, 80, 61)
    draw_arrow(ax, 20, 48, 20, 38)
    draw_arrow(ax, 80, 48, 80, 38)
    draw_arrow(ax, 20, 25, 42, 19)
    draw_arrow(ax, 80, 25, 58, 19)

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig5_flowchart_verification.png"), bbox_inches='tight')
    plt.close()

# Fig 6: Examination Cell Minting & Merkle Workflow
def make_fig6():
    fig, ax = setup_ax(8.2, 4.3)
    ax.text(50, 95, "Fig. 6.1 Examination Cell Batch Minting & Merkle Construction Workflow", ha='center', va='center', fontsize=10.5, fontweight='bold', color="#0F172A")
    
    steps = [
        ("Step 1: Upload CSV", "Exam Cell inputs student roster\n(PRN, Name, CGPA, Branch)", "#EFF6FF", "#2563EB"),
        ("Step 2: Canonicalize", "UTF-8 trim, uppercase normalize\nFormat JSON claims", "#EEF2FF", "#4F46E5"),
        ("Step 3: Merkle Tree", "Pairwise Keccak-256 hash\nBalanced binary DAG", "#FAF5FF", "#9333EA"),
        ("Step 4: Smart Contract", "Emit batch Anchor tx on Sepolia\nStore 32-byte root O(1)", "#ECFDF5", "#059669"),
        ("Step 5: PDF Degree", "Inject QR, Merkle Proof &\nCryptographic Watermark", "#FEF3C7", "#D97706"),
    ]
    
    for i, (t, s, fc, ec) in enumerate(steps):
        x = 2 + i * 19.5
        draw_box(ax, x, 35, 17.5, 36, t, s, fc, ec, ec)
        if i < len(steps) - 1:
            draw_arrow(ax, x + 17.5, 53, x + 19.5, 53)
            
    ax.text(50, 16, "Result: Constant O(1) Gas Cost (84,200 gas) regardless of batch size N (100 to 10,000 students)", ha='center', va='center', fontsize=8.5, fontstyle='italic', color="#1E3A8A", bbox=dict(boxstyle="round,pad=0.4", fc="#EFF6FF", ec="#BFDBFE"))

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig6_workflow_issuance.png"), bbox_inches='tight')
    plt.close()

# Fig 7: Software Topology Diagram
def make_fig7():
    fig, ax = setup_ax(8.5, 4.2)
    ax.text(50, 95, "Fig. 7.1 Infrastructure & Software Component Topology", ha='center', va='center', fontsize=11, fontweight='bold', color="#0F172A")
    
    draw_box(ax, 4, 35, 18, 38, "Client Layer", "Next.js 14 Web App\nMetaMask EIP-712\nDrag & Drop Verifier\nReact Canvas UI", "#EFF6FF", "#2563EB", "#1E3A8A")
    draw_box(ax, 28, 35, 20, 38, "Application Server", "Node.js 18+ App Engine\nEdge API Routes\nWin32 File Sanitizer\nSession HMAC Auth", "#F1F5F9", "#475569", "#0F172A")
    draw_box(ax, 54, 55, 20, 26, "Persistence Layer", "SQLite 3 (WAL Mode)\n5000ms Busy Timeout\nPinata IPFS Backup", "#FFFBEB", "#D97706", "#78350F")
    draw_box(ax, 54, 15, 20, 26, "AI Forensics Service", "FastAPI Python 3.10\nPyTorch ELA CNN\nOpenCV JET Colormap", "#FFE4E6", "#E11D48", "#881337")
    draw_box(ax, 79, 35, 17, 38, "Blockchain Layer", "Ethereum Sepolia\nEIP-1559 Transactions\nAlchemy RPC Provider\nInfura Gas Oracle", "#ECFDF5", "#059669", "#064E3B")

    draw_arrow(ax, 22, 54, 28, 54, "HTTP / RPC")
    draw_arrow(ax, 48, 62, 54, 62, "Local SQL")
    draw_arrow(ax, 48, 38, 54, 30, "REST Proxy")
    draw_arrow(ax, 48, 54, 79, 54, "JSON-RPC")

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig7_software_topology.png"), bbox_inches='tight')
    plt.close()

# Fig 8: Smart Contract Architecture
def make_fig8():
    fig, ax = setup_ax(8.5, 4.2)
    ax.text(50, 95, "Fig. 8.1 Smart Contract Topology & Identity Binding Interface", ha='center', va='center', fontsize=10.5, fontweight='bold', color="#0F172A")
    
    # Contract 1
    draw_box(ax, 4, 15, 42, 68, "CredentialRegistry.sol", 
             "• struct Batch { bytes32 merkleRoot; uint256 timestamp; }\n"
             "• mapping(bytes32 => Batch) public batches;\n"
             "• mapping(bytes32 => mapping(uint256 => uint256)) public revocationBitmaps;\n"
             "• function anchorRoot(bytes32 batchId, bytes32 root) external;\n"
             "• function revokeCredential(bytes32 batchId, uint256 index) external;\n"
             "• function isRevoked(bytes32 batchId, uint256 index) view returns (bool);\n"
             "• function verifyProof(bytes32[] proof, bytes32 root, bytes32 leaf) pure;",
             "#ECFDF5", "#059669", "#064E3B", radius=1.5)

    # Contract 2
    draw_box(ax, 52, 15, 44, 68, "IdentityRegistry.sol & EIP-712", 
             "• mapping(address => bool) public authorizedIssuers;\n"
             "• mapping(string => address) public studentWallets;\n"
             "• EIP-712 Domain: SOET VeriTrust (Version 1.0, Chain 11155111)\n"
             "• struct IdentityBinding {\n"
             "      string studentPRN;\n"
             "      address walletAddress;\n"
             "      uint256 nonce;\n"
             "  }\n"
             "• function bindWalletWithSignature(...) external;\n"
             "• Zero-PII Guarantee: No raw student names/marks on-chain.",
             "#EEF2FF", "#4F46E5", "#312E81", radius=1.5)

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig8_smart_contract_interfaces.png"), bbox_inches='tight')
    plt.close()

# Fig 9: ELA Forensics Workflow
def make_fig9():
    fig, ax = setup_ax(8.5, 4.2)
    ax.text(50, 95, "Fig. 9.1 Deep Learning Error Level Analysis (ELA) Forensic Architecture", ha='center', va='center', fontsize=10.5, fontweight='bold', color="#0F172A")
    
    blocks = [
        ("PDF Document", "Incoming Degree\nCertificate", "#F1F5F9", "#64748B"),
        ("Render Image", "PyMuPDF / pdf2image\n300 DPI Rasterization", "#EFF6FF", "#2563EB"),
        ("JPEG Resave", "Compression at\nQuality Factor = 90", "#FEF3C7", "#D97706"),
        ("ELA Residual", "Absolute Difference:\n|Original - Resaved| * 10", "#FDF2F8", "#DB2777"),
        ("PyTorch CNN", "3 Conv + MaxPool\n+ FC Classifier", "#EEF2FF", "#4F46E5"),
        ("Thermal Map", "OpenCV JET Colormap\nAlpha Blended Overlay", "#FFE4E6", "#E11D48"),
    ]
    
    for i, (t, s, fc, ec) in enumerate(blocks):
        x = 2 + i * 16.2
        draw_box(ax, x, 32, 14.5, 42, t, s, fc, ec, ec)
        if i < len(blocks) - 1:
            draw_arrow(ax, x + 14.5, 53, x + 16.2, 53)

    ax.text(50, 14, "Principle: Manipulated pixels exhibit distinct DCT quantization error levels compared to unmodified regions.", ha='center', va='center', fontsize=8, fontstyle='italic', color="#475569")

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig9_image_processing_ela.png"), bbox_inches='tight')
    plt.close()

# Fig 10: 9-State Diagnostic State Machine
def make_fig10():
    fig, ax = setup_ax(8.5, 4.5)
    ax.text(50, 96, "Fig. 10.1 Nine-State Deterministic Diagnostic State Machine", ha='center', va='center', fontsize=11, fontweight='bold', color="#0F172A")
    
    states = [
        ("1. FULLY_VERIFIED", "#DCFCE7", "#16A34A", 4, 66),
        ("2. CLAIM_MISMATCH_CGPA", "#FEE2E2", "#DC2626", 36, 66),
        ("3. CLAIM_MISMATCH_DEGREE", "#FEE2E2", "#DC2626", 68, 66),
        ("4. MERKLE_PROOF_INVALID", "#FEF3C7", "#D97706", 4, 38),
        ("5. CREDENTIAL_REVOKED", "#FEE2E2", "#DC2626", 36, 38),
        ("6. RECORD_NOT_IN_DATABASE", "#FEF3C7", "#D97706", 68, 38),
        ("7. UNREGISTERED_ISSUER", "#FEF3C7", "#D97706", 4, 10),
        ("8. VISUAL_FORGERY_DETECTED", "#FEE2E2", "#DC2626", 36, 10),
        ("9. SCANNED_REQUIRES_OCR", "#E0E7FF", "#4338CA", 68, 10),
    ]
    
    for t, fc, ec, x, y in states:
        fancy = patches.FancyBboxPatch((x, y), 28, 20, boxstyle="round,pad=0.4,rounding_size=1.5",
                                      facecolor=fc, edgecolor=ec, linewidth=1.3)
        ax.add_patch(fancy)
        ax.text(x + 14, y + 10, t, ha='center', va='center', fontsize=8, fontweight='bold', color=ec)

    plt.tight_layout()
    plt.savefig(os.path.join(OUT_DIR, "fig10_diagnostic_state_machine.png"), bbox_inches='tight')
    plt.close()

if __name__ == "__main__":
    print("Generating 10 project diary architectural figures...")
    make_fig1()
    make_fig2()
    make_fig3()
    make_fig4()
    make_fig5()
    make_fig6()
    make_fig7()
    make_fig8()
    make_fig9()
    make_fig10()
    print("All 10 figures successfully created in:", OUT_DIR)

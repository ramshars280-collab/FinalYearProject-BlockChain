pragma circom 2.0.0;

/**
 * SOET VeriTrust: Zero-Knowledge CGPA Range Proof Circuit
 * Proves that a student's actual CGPA satisfies: actualCgpa >= thresholdCgpa
 * without revealing the student's exact CGPA or personal identity.
 */

template GreaterThanEq(n) {
    signal input in[2]; // in[0] = actualCgpa, in[1] = thresholdCgpa
    signal output out;  // 1 if in[0] >= in[1], else 0

    component comp = LessThan(n);
    comp.in[0] <== in[0];
    comp.in[1] <== in[1];

    out <== 1 - comp.out;
}

template LessThan(n) {
    assert(n <= 252);
    signal input in[2];
    signal output out;

    component n2b = Num2Bits(n + 1);
    n2b.in <== in[0] + (1 << n) - in[1];

    out <== 1 - n2b.out[n];
}

template Num2Bits(n) {
    signal input in;
    signal output out[n];

    var lc1 = 0;
    var e2 = 1;
    for (var i = 0; i < n; i++) {
        out[i] <-- (in >> i) & 1;
        out[i] * (out[i] - 1) === 0;
        lc1 += out[i] * e2;
        e2 = e2 + e2;
    }
    lc1 === in;
}

template CgpaThresholdProof() {
    // Private Inputs (Kept secret by the student)
    signal input actualCgpaScaled; // e.g. CGPA 8.85 * 100 = 885
    signal input studentSalt;       // Random 256-bit blinding salt

    // Public Inputs (Disclosed to the verifier)
    signal input thresholdCgpaScaled; // e.g. Threshold 7.50 * 100 = 750
    signal input commitmentHash;      // Keccak256 commitment of actualCgpa + salt

    // Output Signal
    signal output isSatisfied;

    // 1. Verify Range Assertion: actualCgpaScaled >= thresholdCgpaScaled
    component gte = GreaterThanEq(16);
    gte.in[0] <== actualCgpaScaled;
    gte.in[1] <== thresholdCgpaScaled;

    isSatisfied <== gte.out;
    isSatisfied === 1; // Enforce proof validity
}

component main {public [thresholdCgpaScaled, commitmentHash]} = CgpaThresholdProof();

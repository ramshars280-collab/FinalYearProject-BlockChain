import { CourseCreditRecord } from "../types";

export interface NHEQFLevelInfo {
  level: number;
  descriptor: string;
  minCumulativeCredits: number;
  qualificationAwarded: string;
}

export const NHEQF_LEVEL_MAP: Record<number, NHEQFLevelInfo> = {
  4.5: {
    level: 4.5,
    descriptor: "Undergraduate Certificate (Year 1 Exit)",
    minCumulativeCredits: 40,
    qualificationAwarded: "UG Certificate",
  },
  5.0: {
    level: 5.0,
    descriptor: "Undergraduate Diploma (Year 2 Exit / Lateral Entry Gateway)",
    minCumulativeCredits: 80,
    qualificationAwarded: "UG Diploma",
  },
  5.5: {
    level: 5.5,
    descriptor: "Bachelor Degree (3-Year Program Exit)",
    minCumulativeCredits: 120,
    qualificationAwarded: "Bachelor Degree",
  },
  6.0: {
    level: 6.0,
    descriptor: "Bachelor Degree (4-Year B.Tech / Honours with Research)",
    minCumulativeCredits: 160,
    qualificationAwarded: "B.Tech / Bachelor Degree (Honours)",
  },
  6.5: {
    level: 6.5,
    descriptor: "Post-Graduate Diploma (1-Year PG)",
    minCumulativeCredits: 200,
    qualificationAwarded: "PG Diploma",
  },
  7.0: {
    level: 7.0,
    descriptor: "Master's Degree (M.Tech / M.Sc / MBA / ME)",
    minCumulativeCredits: 240,
    qualificationAwarded: "Master's Degree",
  },
  8.0: {
    level: 8.0,
    descriptor: "Doctoral Degree (Ph.D.)",
    minCumulativeCredits: 300,
    qualificationAwarded: "Ph.D.",
  },
};

/**
 * Calculates total credits, average grade point, and NHEQF qualification eligibility
 * under India's NEP 2020 Academic Bank of Credits (ABC) standard.
 */
export function calculateAcademicBankOfCredits(courses: CourseCreditRecord[]) {
  const totalCredits = courses.reduce(
    (acc, curr) => acc + (curr.status === "VERIFIED_ON_CHAIN" ? curr.creditsEarned : 0),
    0
  );

  const gradePoints: Record<string, number> = {
    "O": 10,
    "A+": 9,
    "A": 8,
    "B+": 7,
    "B": 6,
    "C": 5,
    "P": 4,
    "F": 0,
  };

  let weightedPointsSum = 0;
  let gradedCreditsSum = 0;

  for (const c of courses) {
    if (c.status === "VERIFIED_ON_CHAIN") {
      const gp = gradePoints[c.grade.toUpperCase()] ?? 7.0;
      weightedPointsSum += gp * c.creditsEarned;
      gradedCreditsSum += c.creditsEarned;
    }
  }

  const weightedGpa =
    gradedCreditsSum > 0 ? (weightedPointsSum / gradedCreditsSum).toFixed(2) : "0.00";

  let eligibleNheqfLevel = 4.0;
  let qualificationTitle = "Pre-University / Foundation";

  const levels = [8.0, 7.0, 6.5, 6.0, 5.5, 5.0, 4.5];
  for (const lvl of levels) {
    const info = NHEQF_LEVEL_MAP[lvl];
    if (totalCredits >= info.minCumulativeCredits) {
      eligibleNheqfLevel = lvl;
      qualificationTitle = info.descriptor;
      break;
    }
  }

  return {
    totalCredits,
    verifiedCount: courses.filter((c) => c.status === "VERIFIED_ON_CHAIN").length,
    weightedGpa: parseFloat(weightedGpa),
    eligibleNheqfLevel,
    qualificationTitle,
    isLateralEntryEligible: totalCredits >= 80, // Year 2 entry requirement
  };
}

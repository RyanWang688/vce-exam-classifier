"""Short codes for labelling. Used by dump.py and score.py."""
CODES = {
    "Mathematical Methods": {
        "F": "Functions, relations and graphs", "A": "Algebra, number and structure", "D": "Calculus: differentiation",
        "I": "Calculus: anti-differentiation and integration", "P": "Probability: discrete random variables",
        "C": "Probability: continuous random variables", "S": "Statistics: sample proportions and confidence intervals",
    },
    "Specialist Mathematics": {
        "L": "Logic and proof", "F": "Functions, relations and graphs", "Z": "Complex numbers",
        "C": "Differential calculus and integral calculus", "DE": "Differential equations", "K": "Kinematics: rectilinear motion",
        "V": "Vectors", "VE": "Vector and Cartesian equations", "VC": "Vector calculus",
        "LC": "Distribution of linear combinations of random variables", "SM": "Distribution of the sample mean",
        "CI": "Confidence intervals for the population mean", "HT": "Hypothesis testing for a population mean",
    },
    "General Mathematics": {
        "DD": "Investigating data distributions", "AS": "Investigating association between two variables",
        "LR": "Investigating and modelling linear associations", "TS": "Investigating and modelling time series data",
        "DP": "Depreciation of assets", "CI": "Compound interest investments and loans", "RB": "Reducing balance loans",
        "AN": "Annuities and perpetuities", "AD": "Compound interest investment with periodic and equal additions to the principal",
        "MA": "Matrices and their applications", "TM": "Transition matrices", "GN": "Graphs and networks",
        "ET": "Exploring and travelling problems", "TR": "Trees and minimum connector problems", "FL": "Flow problems",
        "SP": "Shortest path problems", "MT": "Matching problems", "CP": "Scheduling problems and critical path analysis",
    },
}
BACK = {s: {v: k for k, v in c.items()} for s, c in CODES.items()}

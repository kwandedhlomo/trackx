// utils/caseSession.js
export function clearCaseSession() {
    try {
      localStorage.removeItem("trackxCurrentCaseId");
      localStorage.removeItem("trackxCaseData");
      localStorage.removeItem("trackxCurrentLocationIndex");
      sessionStorage.removeItem("locationSnapshots");
    } catch (e) {
      console.warn("clearCaseSession warning:", e);
    }
  }
  
# TrackX – Vehicle Investigation Automation Tool

TrackX is an advanced digital forensics platform that enables the triangulation of stolen vehicle locations based on GPS data. Designed to assist law enforcement and investigation units, the system allows users to:

- Create and manage vehicle tracking cases.
- Upload CSV files with GPS logs.
- Visualize movement on a Google Map.
- Generate formal PDF reports including maps and officer notes.
- Access visual dashboards for aggregated case data.

---

## Tech Stack

### Frontend
- **React.js** – Frontend framework for building the user interface
- **Vite** – Fast dev server and build tool
- **Tailwind CSS** – For responsive and consistent UI styling
- **Framer Motion** – Smooth UI animations
- **React Router** – In-app navigation
- **Recharts** – Data visualizations
- **jsPDF + html2canvas** – Export maps and notes into downloadable reports
- **PapaParse** – CSV file parser

### Backend
- **FastAPI** – High-performance API for case data, report generation, and map interaction
- **Firebase** – Handles authentication and Firestore database storage
- **Google Maps API** – GPS visualization integration


### Prerequisites

- Node.js and npm installed
- Python 3.10+ and `venv`
- Firebase account & Firestore setup
- Google Maps API key

Run the following commands in your terminal to activate the backend:
cd trackx-backend
python -m venv venv
source venv/bin/activate  # or venv\Scripts\activate on Windows

pip install -r requirements.txt
uvicorn main:app --reload

once done, run the following commands in your terminal to activate the frontend: 
cd trackx-frontend
npm install
npm run dev

ENJOY!

## Authors
Shewe Tarumbwa
Jon-Luke Ferreira
Pearl Ndlozi
Kwande Dhlomo
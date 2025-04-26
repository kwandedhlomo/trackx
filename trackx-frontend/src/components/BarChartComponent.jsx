import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const data = [
  { region: "Western Cape", cases: 50 },
  { region: "KZN", cases: 80 },
  { region: "Gauteng", cases: 40 },
  { region: "Eastern Cape", cases: 70 },
  { region: "Free State", cases: 60 },
];

function BarChartComponent() {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data}>
        <XAxis dataKey="region" stroke="#cbd5e1" />
        <YAxis stroke="#cbd5e1" />
        <Tooltip />
        <Bar dataKey="cases" fill="#1e40af" />
      </BarChart>
    </ResponsiveContainer>
  );
}

export default BarChartComponent;
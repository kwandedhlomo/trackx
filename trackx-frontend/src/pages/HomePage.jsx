import { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import ReactECharts from "echarts-for-react";
import adfLogo from "../assets/image-removebg-preview.png"; 
import trackxLogo from "../assets/trackx-logo-removebg-preview.png";
import {
  Home as HomeIcon,
  FilePlus2,
  FolderOpen,
  Briefcase,
  Users,
  LayoutDashboard,
  Maximize2,
  X,
  SlidersHorizontal,
  Calendar,
  Trash2,
} from "lucide-react";
// import HeatMapComponent from "../components/HeatMapComponent";
import GlobeBackground from "../components/GlobeBackground"; 
import { auth } from "../firebase"; 
import { useAuth } from "../context/AuthContext";
import { signOut } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import MiniHeatMapWindow from "../components/MiniHeatMapWindow";
import NotificationBell from "../components/NotificationBell";
import RegionSelectorModal from "../components/RegionSelectorModal";
import { getMiniHeatmapPoints } from "../services/miniHeatmapService";
import { getGlobePoints } from "../services/globePointsService";
import axiosInstance from "../api/axios";


function HomePage() {
    const [clearMode, setClearMode] = useState(false); 
    const [showMenu, setShowMenu] = useState(false);
    const [recentCases, setRecentCases] = useState([]);
    const [allCases, setAllCases] = useState([]);
    const { profile } = useAuth();
    const navigate = useNavigate(); 
    const [heatPoints, setHeatPoints] = useState([]);
    const [globePoints, setGlobePoints] = useState([]);
    const [sortBy, setSortBy] = useState("dateEntered"); // default sort option
    const [expandedChart, setExpandedChart] = useState(null);
    const REGION_DEFAULT = {
      region: "all",
      provinceCode: "",
      provinceName: "",
      districtCode: "",
      districtName: "",
    };

    const createFilterState = (overrides = {}) => ({
      startDate: "",
      endDate: "",
      status: "all",
      ...REGION_DEFAULT,
      ...overrides,
    });

    const [globalFilter, setGlobalFilter] = useState(createFilterState());
    const [statusFilter, setStatusFilter] = useState(createFilterState());
    const [trendFilter, setTrendFilter] = useState(createFilterState());
    const [regionFilter, setRegionFilter] = useState(createFilterState());
    const [activeRegionPicker, setActiveRegionPicker] = useState(null);
    const regionSetterMap = {
      global: setGlobalFilter,
      status: setStatusFilter,
      trend: setTrendFilter,
      region: setRegionFilter,
    };

    const getFilterRegionLabel = (filter) => {
      if (filter.region && filter.region !== "all") {
        return filter.region;
      }
      if (filter.provinceName) {
        return filter.districtName
          ? `${filter.provinceName} - ${filter.districtName}`
          : filter.provinceName;
      }
      return "All regions";
    };

    const applyRegionSelection = (targetKey, selection) => {
      const setter = regionSetterMap[targetKey];
      if (!setter) return;
      const { provinceCode, provinceName, districtCode, districtName } = selection || {};
      const label = provinceName
        ? districtName
          ? `${provinceName} - ${districtName}`
          : provinceName
        : "all";
      setter((prev) => ({
        ...prev,
        region: label || "all",
        provinceCode: provinceCode || "",
        provinceName: provinceName || "",
        districtCode: districtCode || "",
        districtName: districtName || "",
      }));
    };

    const hasRegionSelection = (filter) =>
      Boolean(
        (filter.region && filter.region !== "all") ||
          filter.provinceCode ||
          filter.provinceName ||
          filter.districtCode ||
          filter.districtName
      );

    const handleRegionSelection = (selection) => {
      if (activeRegionPicker) {
        applyRegionSelection(activeRegionPicker, selection);
      }
      setActiveRegionPicker(null);
    };

    const closeExpandedChart = () => setExpandedChart(null);

    const normalizeText = (value) => (value ? String(value).trim().toLowerCase() : "");

    const convertToDate = (value) => {
      if (!value) return null;
      if (value instanceof Date) return value;
      if (typeof value === "string" || typeof value === "number") {
        const parsed = new Date(value);
        return Number.isNaN(parsed.getTime()) ? null : parsed;
      }
      if (typeof value === "object") {
        if (typeof value.toDate === "function") {
          try {
            return value.toDate();
          } catch {
            // ignore and continue fallback checks
          }
        }
        const seconds = value.seconds ?? value._seconds;
        if (typeof seconds === "number") {
          return new Date(seconds * 1000);
        }
        if (value.nanoseconds && value.seconds) {
          return new Date(value.seconds * 1000 + value.nanoseconds / 1e6);
        }
      }
      return null;
    };

    const getCaseDate = (caseItem = {}) => {
      const candidates = [
        caseItem.dateOfIncident,
        caseItem.dateEntered,
        caseItem.createdAt,
        caseItem.updatedAt,
      ];
      for (const candidate of candidates) {
        const parsed = convertToDate(candidate);
        if (parsed) return parsed;
      }
      return null;
    };

    const filterCases = (cases, filters = {}) => {
      if (!Array.isArray(cases) || cases.length === 0) {
        return [];
      }

      const {
        startDate,
        endDate,
        region,
        status,
        provinceCode,
        provinceName,
        districtCode,
        districtName,
      } = filters;
      const startCandidate = startDate ? new Date(startDate) : null;
      const endCandidate = endDate ? new Date(endDate) : null;
      const start = startCandidate && !Number.isNaN(startCandidate.getTime()) ? startCandidate : null;
      const end = endCandidate && !Number.isNaN(endCandidate.getTime()) ? endCandidate : null;
      const regionNormalized = region && region !== "all" ? normalizeText(region) : "";
      const statusNormalized = status && status !== "all" ? normalizeText(status) : "";
      const provinceCodeFilter = provinceCode ? String(provinceCode).trim() : "";
      const districtCodeFilter = districtCode ? String(districtCode).trim() : "";
      const provinceNameFilter = provinceName ? normalizeText(provinceName) : "";
      const districtNameFilter = districtName ? normalizeText(districtName) : "";

      return cases.filter((caseItem) => {
        const caseDate = getCaseDate(caseItem);

        if (start && (!caseDate || caseDate < start)) {
          return false;
        }
        if (end) {
          const adjustedEnd = new Date(end);
          adjustedEnd.setHours(23, 59, 59, 999);
          if (!caseDate || caseDate > adjustedEnd) {
            return false;
          }
        }

        if (
          regionNormalized ||
          provinceCodeFilter ||
          provinceNameFilter ||
          districtCodeFilter ||
          districtNameFilter
        ) {
          const caseProvinceCode = caseItem?.provinceCode ? String(caseItem.provinceCode).trim() : "";
          const caseDistrictCode = caseItem?.districtCode ? String(caseItem.districtCode).trim() : "";
          const caseProvinceName = normalizeText(caseItem?.provinceName || "");
          const caseDistrictName = normalizeText(caseItem?.districtName || "");
          const legacyRegion = normalizeText(caseItem?.region || "");

          if (districtCodeFilter && (!caseDistrictCode || caseDistrictCode !== districtCodeFilter)) {
            return false;
          }

          if (
            districtNameFilter &&
            caseDistrictName !== districtNameFilter &&
            normalizeText(caseItem?.districtDisplayName || "") !== districtNameFilter
          ) {
            return false;
          }

          if (provinceCodeFilter && (!caseProvinceCode || caseProvinceCode !== provinceCodeFilter)) {
            return false;
          }

          if (
            provinceNameFilter &&
            caseProvinceName !== provinceNameFilter &&
            legacyRegion !== provinceNameFilter
          ) {
            return false;
          }

          if (
            !districtCodeFilter &&
            !provinceCodeFilter &&
            !provinceNameFilter &&
            !districtNameFilter &&
            regionNormalized
          ) {
            const regionCandidates = [
              legacyRegion,
              caseProvinceName,
              caseDistrictName,
              caseProvinceName && caseDistrictName ? `${caseProvinceName} - ${caseDistrictName}` : "",
            ]
              .filter(Boolean)
              .map(normalizeText);

            if (!regionCandidates.includes(regionNormalized)) {
              return false;
            }
          }
        }

        if (statusNormalized) {
          const itemStatus = normalizeText(caseItem.status || "");
          if (itemStatus !== statusNormalized) {
            return false;
          }
        }

        return true;
      });
    };

    const computeStatusCounts = (cases) => {
      const counts = { "not started": 0, "in progress": 0, completed: 0, other: 0 };
      if (!Array.isArray(cases)) {
        return counts;
      }

      cases.forEach((caseItem) => {
        const key = normalizeText(caseItem.status);
        if (key in counts) {
          counts[key] += 1;
        } else if (key) {
          counts.other += 1;
        }
      });
      return counts;
    };

    const computeMonthlyCounts = (cases) => {
      if (!Array.isArray(cases) || cases.length === 0) {
        return [];
      }

      const map = new Map();
      cases.forEach((caseItem) => {
        const caseDate = getCaseDate(caseItem);
        if (!caseDate) return;

        const monthKey = caseDate.getFullYear() * 12 + caseDate.getMonth();
        const label = caseDate.toLocaleString(undefined, { month: "short", year: "numeric" });
        const existing = map.get(monthKey) || { month: label, count: 0 };
        existing.count += 1;
        map.set(monthKey, existing);
      });

      return Array.from(map.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([, value]) => value);
    };

    const computeRegionCounts = (cases) => {
      if (!Array.isArray(cases) || cases.length === 0) {
        return [];
      }

      const countsMap = new Map();
      cases.forEach((caseItem) => {
        const provinceName = caseItem?.provinceName ? String(caseItem.provinceName).trim() : "";
        const districtName = caseItem?.districtName ? String(caseItem.districtName).trim() : "";
        const legacyRegion = caseItem?.region ? String(caseItem.region).trim() : "";

        const key = provinceName
          ? districtName
            ? `${provinceName} - ${districtName}`
            : provinceName
          : legacyRegion || "Unknown";
        countsMap.set(key, (countsMap.get(key) || 0) + 1);
      });

      return Array.from(countsMap.entries())
        .map(([region, count]) => ({ region, count }))
        .sort((a, b) => b.count - a.count);
    };

    const formatStatusLabel = (status) => {
      if (!status) return "Unknown";
      const cleaned = status.toLowerCase();
      return cleaned.replace(/\b\w/g, (char) => char.toUpperCase());
    };

    const ChartModal = ({ title, subtitle, children }) => (
      <div className="fixed inset-0 z-[60] flex items-center justify-center px-4 py-8">
        <div
          className="absolute inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
          onClick={closeExpandedChart}
        />
        <div className="relative z-[61] w-full max-w-4xl">
          <div className="relative overflow-hidden rounded-3xl border border-white/15 bg-gradient-to-br from-slate-950/95 via-slate-900/90 to-slate-950/95 p-8 shadow-[0_0_70px_rgba(59,130,246,0.55)]">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-900/25 via-transparent to-purple-900/25" />
            <button
              type="button"
              onClick={closeExpandedChart}
              className="group absolute right-6 top-6 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/[0.06] text-white/80 transition-all duration-300 hover:bg-red-500/20 hover:text-white hover:shadow-[0_0_25px_rgba(248,113,113,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/80"
              aria-label="Close expanded chart"
            >
              <X className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
            </button>
            <div className="relative flex flex-col gap-4 text-white">
              <div className="flex flex-wrap items-center justify-between gap-4 pr-16">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight">{title}</h2>
                  {subtitle ? (
                    <p className="mt-1 max-w-xl text-sm text-gray-300">{subtitle}</p>
                  ) : null}
                </div>
                <div className="ml-auto mr-2 flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-blue-500/10 text-blue-200 shadow-[0_0_35px_rgba(59,130,246,0.45)]">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    );


    // For Sign Out functionality
    const handleSignOut = async () => {
      try {
        await signOut(auth);
        navigate("/"); // Redirect to LandingPage
      } catch (error) {
        console.error("Sign-out failed:", error.message);
      }
    };

    
    //check who the logged in user is
    useEffect(() => { 
      const user = auth.currentUser;
      if (user) {
        console.log("Logged in user:", user);
      } else {
        console.warn(" No user is currently logged in.");
      }
    }, []);

    useEffect(() => {
      if (typeof document === "undefined") {
        return undefined;
      }

      if (!expandedChart) {
        document.body.style.overflow = "";
        return undefined;
      }

      document.body.style.overflow = "hidden";
      const handleKeyDown = (event) => {
        if (event.key === "Escape") {
          setExpandedChart(null);
        }
      };

      window.addEventListener("keydown", handleKeyDown);
      return () => {
        document.body.style.overflow = "";
        window.removeEventListener("keydown", handleKeyDown);
      };
    }, [expandedChart]);

    useEffect(() => {
      const fetchRecentCases = async () => {
        try {
          const response = await axiosInstance.get("/cases/recent", {
            params: {
              sortBy,
              ...(profile?.role !== "admin" && profile?.userID ? { user_id: profile.userID } : {})
            }
          });

          console.log("Recent cases response:", response.data.cases);
          setRecentCases(response.data.cases);
        } catch (error) {
          console.error("Failed to fetch recent cases:", error);
        }
      };

      if (profile) {
        fetchRecentCases();
      }
    }, [sortBy, profile]);


    useEffect(() => {
      const fetchAllCases = async () => {
        try {
          const response = await axiosInstance.get("/cases/search", {
            params: profile?.role === "admin" ? {} : { user_id: profile?.userID },
          });

          const fetchedCases = Array.isArray(response.data.cases) ? response.data.cases : [];
          setAllCases(fetchedCases);
        } catch (err) {
          console.error("Failed to fetch cases:", err);
          setAllCases([]);
        }
      };

      if (profile) {
        fetchAllCases();
      }
    }, [profile]);

    const availableStatuses = useMemo(() => {
      const statusSet = new Set();
      allCases.forEach((caseItem) => {
        if (caseItem?.status) {
          statusSet.add(normalizeText(caseItem.status));
        }
      });
      return Array.from(statusSet).sort((a, b) => a.localeCompare(b));
    }, [allCases]);

    const globallyFilteredCases = useMemo(
      () => filterCases(allCases, globalFilter),
      [allCases, globalFilter]
    );

    const globalStatusStats = useMemo(
      () => computeStatusCounts(globallyFilteredCases),
      [globallyFilteredCases]
    );

    const filteredRecentCases = useMemo(
      () => filterCases(recentCases, globalFilter),
      [recentCases, globalFilter]
    );

    const statusFilteredCases = useMemo(
      () => filterCases(globallyFilteredCases, statusFilter),
      [globallyFilteredCases, statusFilter]
    );

    const trendFilteredCases = useMemo(
      () => filterCases(globallyFilteredCases, trendFilter),
      [globallyFilteredCases, trendFilter]
    );

    const regionFilteredCases = useMemo(
      () => filterCases(globallyFilteredCases, regionFilter),
      [globallyFilteredCases, regionFilter]
    );

    const filteredStatusStats = useMemo(
      () => computeStatusCounts(statusFilteredCases),
      [statusFilteredCases]
    );

    const filteredMonthlyCounts = useMemo(
      () => computeMonthlyCounts(trendFilteredCases),
      [trendFilteredCases]
    );

    const filteredRegionCounts = useMemo(
      () => computeRegionCounts(regionFilteredCases),
      [regionFilteredCases]
    );

    const pieData = useMemo(() => {
      const data = [
        { name: "Not Started", value: filteredStatusStats["not started"] || 0 },
        { name: "In Progress", value: filteredStatusStats["in progress"] || 0 },
        { name: "Completed", value: filteredStatusStats.completed || 0 },
      ];

      if (filteredStatusStats.other) {
        data.push({
          name: "Other",
          value: filteredStatusStats.other,
        });
      }

      return data;
    }, [filteredStatusStats]);

    const isGlobalFilterActive =
      Boolean(globalFilter.startDate) ||
      Boolean(globalFilter.endDate) ||
      hasRegionSelection(globalFilter) ||
      (globalFilter.status && globalFilter.status !== "all");

    const isStatusFilterActive =
      Boolean(statusFilter.startDate) ||
      Boolean(statusFilter.endDate) ||
      hasRegionSelection(statusFilter);

    const isTrendFilterActive =
      Boolean(trendFilter.startDate) ||
      Boolean(trendFilter.endDate) ||
      hasRegionSelection(trendFilter) ||
      (trendFilter.status && trendFilter.status !== "all");

    const isRegionFilterActive =
      Boolean(regionFilter.startDate) ||
      Boolean(regionFilter.endDate) ||
      (regionFilter.status && regionFilter.status !== "all") ||
      hasRegionSelection(regionFilter);

    const statusCardFiltered = isGlobalFilterActive || isStatusFilterActive;
    const trendCardFiltered = isGlobalFilterActive || isTrendFilterActive;
    const regionCardFiltered = isGlobalFilterActive || isRegionFilterActive;

    const totalCases = globallyFilteredCases.length;

    const activeCases =
      (globalStatusStats["not started"] || 0) +
      (globalStatusStats["in progress"] || 0);

    const completionRate = totalCases
      ? Math.round(((globalStatusStats.completed || 0) / totalCases) * 100)
      : 0;

    const now = new Date();
    const formattedDateTime = now.toLocaleString();
    const formattedDate = now.toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
    const formattedTime = now.toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
    });
    const userRoleLabel = profile?.role ? `${String(profile.role).toUpperCase()} ACCESS` : "Secure access";

    const pieOption = useMemo(() => {
      const seriesData = pieData.map((item) => ({
        value: item.value,
        name: item.name,
      }));

      return {
        backgroundColor: "transparent",
        legend: {
          top: "bottom",
          textStyle: {
            color: "#e2e8f0",
            fontSize: 11,
          },
          itemWidth: 12,
          itemHeight: 12,
        },
        tooltip: {
          trigger: "item",
          backgroundColor: "rgba(15,23,42,0.88)",
          borderColor: "rgba(30,64,175,0.45)",
          borderWidth: 1,
          textStyle: {
            color: "#f8fafc",
          },
          formatter: ({ name, value, percent }) => `${name}: ${value} (${percent}%)`,
        },
        color: [
          "#c2410c",
          "#1d4ed8",
          "#0f766e",
        ],
        series: [
          {
            name: "Resolution Status",
            type: "pie",
            radius: ["40%", "68%"],
            avoidLabelOverlap: false,
            itemStyle: {
              borderRadius: 12,
              borderColor: "rgba(15,23,42,0.9)",
              borderWidth: 2,
            },
            label: {
              show: true,
              formatter: "{b}: {c}",
              color: "#e2e8f0",
              fontSize: 12,
            },
            labelLine: {
              length: 15,
              length2: 10,
              lineStyle: {
                color: "rgba(226,232,240,0.35)",
              },
            },
            data: seriesData,
          },
        ],
      };
    }, [pieData]);

    const lineOption = useMemo(() => {
      const categories = filteredMonthlyCounts.map((item) => item.month ?? "Unknown");
      const values = filteredMonthlyCounts.map((item) => item.count ?? 0);

      return {
        backgroundColor: "transparent",
        grid: { top: 40, left: 45, right: 25, bottom: 35 },
        tooltip: {
          trigger: "axis",
          backgroundColor: "rgba(15,23,42,0.88)",
          borderColor: "rgba(30,64,175,0.45)",
          borderWidth: 1,
          textStyle: { color: "#f8fafc" },
        },
        xAxis: {
          type: "category",
          data: categories.length ? categories : ["No Data"],
          boundaryGap: false,
          axisLine: { lineStyle: { color: "rgba(148,163,184,0.45)" } },
          axisLabel: { color: "rgba(226,232,240,0.8)", fontSize: 11 },
          axisTick: { show: false },
        },
        yAxis: {
          type: "value",
          minInterval: 1,
          axisLine: { show: false },
          splitLine: { lineStyle: { color: "rgba(148,163,184,0.2)" } },
          axisLabel: { color: "rgba(226,232,240,0.8)", fontSize: 11 },
        },
        series: [
          {
            name: "Cases",
            type: "line",
            smooth: true,
            showSymbol: true,
            symbolSize: 8,
            lineStyle: {
              width: 3,
              color: "#1e3a8a",
            },
            itemStyle: {
              color: "#1e3a8a",
              borderColor: "rgba(15,23,42,0.9)",
              borderWidth: 2,
            },
            areaStyle: {
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(30,64,175,0.45)" },
                  { offset: 1, color: "rgba(15,23,42,0.08)" },
                ],
              },
            },
            data: values.length ? values : [0],
          },
        ],
      };
    }, [filteredMonthlyCounts]);

    const barOption = useMemo(() => {
      const regions = filteredRegionCounts.map((item) => item.region ?? "Unknown");
      const counts = filteredRegionCounts.map((item) => item.count ?? 0);

      return {
        backgroundColor: "transparent",
        grid: { top: 30, left: 45, right: 20, bottom: 40 },
        tooltip: {
          trigger: "axis",
          axisPointer: { type: "shadow" },
          backgroundColor: "rgba(15,23,42,0.88)",
          borderColor: "rgba(30,64,175,0.45)",
          borderWidth: 1,
          textStyle: { color: "#f8fafc" },
        },
        xAxis: {
          type: "category",
          data: regions.length ? regions : ["No Data"],
          axisTick: { show: false },
          axisLine: { lineStyle: { color: "rgba(148,163,184,0.45)" } },
          axisLabel: { color: "rgba(226,232,240,0.82)", fontSize: 11 },
        },
        yAxis: {
          type: "value",
          minInterval: 1,
          axisLine: { show: false },
          splitLine: { lineStyle: { color: "rgba(148,163,184,0.2)" } },
          axisLabel: { color: "rgba(226,232,240,0.82)", fontSize: 11 },
        },
        series: [
          {
            name: "Cases",
            type: "bar",
            barWidth: "45%",
            itemStyle: {
              borderRadius: [8, 8, 0, 0],
              color: {
                type: "linear",
                x: 0,
                y: 0,
                x2: 0,
                y2: 1,
                colorStops: [
                  { offset: 0, color: "rgba(30,64,175,0.95)" },
                  { offset: 1, color: "rgba(15,23,42,0.65)" },
                ],
              },
            },
            data: counts.length ? counts : [0],
          },
        ],
      };
    }, [filteredRegionCounts]);

    useEffect(() => {
      let isMounted = true;
      getMiniHeatmapPoints({ limit: 20 })
        .then((points) => {
          if (isMounted) {
            setHeatPoints(points);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch mini heatmap points:", err);
        });
      return () => {
        isMounted = false;
      };
    }, []);

    useEffect(() => {
      let isMounted = true;
      getGlobePoints()
        .then((points) => {
          if (isMounted) {
            setGlobePoints(points);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch globe points:", err);
        });
      return () => {
        isMounted = false;
      };
    }, []);

    return (
      <div className="relative flex flex-col min-h-screen">
        {expandedChart === "status" && (
          <ChartModal
            title="Resolution Status Breakdown"
            subtitle="Surface the current status mix for cases filtered by date or region."
          >
            <div className="relative mt-2 space-y-6">
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                  Start Date
                  <div className="relative mt-2 w-48">
                    <input
                      type="date"
                      value={statusFilter.startDate}
                      onChange={(event) =>
                        setStatusFilter((prev) => ({ ...prev, startDate: event.target.value }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 pr-10 text-sm text-white shadow-inner shadow-white/10 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                      style={{ colorScheme: "dark" }}
                    />
                    <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-200 opacity-80" />
                  </div>
                </label>
                <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                  End Date
                  <div className="relative mt-2 w-48">
                    <input
                      type="date"
                      value={statusFilter.endDate}
                      onChange={(event) =>
                        setStatusFilter((prev) => ({ ...prev, endDate: event.target.value }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 pr-10 text-sm text-white shadow-inner shadow-white/10 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                      style={{ colorScheme: "dark" }}
                    />
                    <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-200 opacity-80" />
                  </div>
                </label>
                <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                  Region
                  <button
                    type="button"
                    onClick={() => setActiveRegionPicker("status")}
                    className="mt-2 w-52 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-left text-sm text-white shadow-inner shadow-white/10 transition hover:border-blue-500/40 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                  >
                    <span className="block truncate">{getFilterRegionLabel(statusFilter)}</span>
                  </button>
                </label>
                <button
                  type="button"
                  onClick={() => setStatusFilter(createFilterState())}
                  disabled={!isStatusFilterActive}
                  className={`ml-auto rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                    isStatusFilterActive
                      ? "border-blue-500/40 bg-blue-500/10 text-blue-200 hover:bg-blue-500/20 hover:shadow-[0_0_25px_rgba(59,130,246,0.4)]"
                      : "cursor-not-allowed border-white/10 bg-white/[0.04] text-gray-500"
                  }`}
                >
                  Reset
                </button>
              </div>
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_45px_rgba(37,99,235,0.35)]">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-900/20 via-transparent to-indigo-900/25" />
                <ReactECharts
                  option={pieOption}
                  style={{ height: 360, width: "100%" }}
                  notMerge
                  lazyUpdate
                />
              </div>
            </div>
          </ChartModal>
        )}

        {expandedChart === "trend" && (
          <ChartModal
            title="Case Distribution Over Time"
            subtitle="Inspect the cadence of case creation with optional filters for source region and status."
          >
            <div className="relative mt-2 space-y-6">
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                  Start Date
                  <div className="relative mt-2 w-48">
                    <input
                      type="date"
                      value={trendFilter.startDate}
                      onChange={(event) =>
                        setTrendFilter((prev) => ({ ...prev, startDate: event.target.value }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 pr-10 text-sm text-white shadow-inner shadow-white/10 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/60"
                      style={{ colorScheme: "dark" }}
                    />
                    <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-200 opacity-80" />
                  </div>
                </label>
                <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                  End Date
                  <div className="relative mt-2 w-48">
                    <input
                      type="date"
                      value={trendFilter.endDate}
                      onChange={(event) =>
                        setTrendFilter((prev) => ({ ...prev, endDate: event.target.value }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 pr-10 text-sm text-white shadow-inner shadow-white/10 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/60"
                      style={{ colorScheme: "dark" }}
                    />
                    <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-indigo-200 opacity-80" />
                  </div>
                </label>
                <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                  Region
                  <button
                    type="button"
                    onClick={() => setActiveRegionPicker("trend")}
                    className="mt-2 w-52 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-left text-sm text-white shadow-inner shadow-white/10 transition hover:border-indigo-500/40 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/60"
                  >
                    <span className="block truncate">{getFilterRegionLabel(trendFilter)}</span>
                  </button>
                </label>
                <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                  Status
                  <select
                    value={trendFilter.status}
                    onChange={(event) =>
                      setTrendFilter((prev) => ({ ...prev, status: event.target.value }))
                    }
                    className="mt-2 w-52 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white shadow-inner shadow-white/10 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500/60"
                  >
                    <option value="all">All statuses</option>
                    {availableStatuses.map((status) => (
                      <option key={status} value={status}>
                        {formatStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  type="button"
                  onClick={() => setTrendFilter(createFilterState())}
                  disabled={!isTrendFilterActive}
                  className={`ml-auto rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                    isTrendFilterActive
                      ? "border-indigo-500/40 bg-indigo-500/15 text-indigo-200 hover:bg-indigo-500/25 hover:shadow-[0_0_25px_rgba(99,102,241,0.4)]"
                      : "cursor-not-allowed border-white/10 bg-white/[0.04] text-gray-500"
                  }`}
                >
                  Reset
                </button>
              </div>
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_45px_rgba(76,29,149,0.35)]">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-900/20 via-transparent to-purple-900/25" />
                <ReactECharts
                  option={lineOption}
                  style={{ height: 360, width: "100%" }}
                  notMerge
                  lazyUpdate
                />
              </div>
            </div>
          </ChartModal>
        )}

        {expandedChart === "region" && (
          <ChartModal
            title="Case Frequency by Region"
            subtitle="Discover which regions are producing the highest case load within your chosen window."
          >
            <div className="relative mt-2 space-y-6">
              <div className="flex flex-wrap items-end gap-4">
                <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                  Start Date
                  <div className="relative mt-2 w-48">
                    <input
                      type="date"
                      value={regionFilter.startDate}
                      onChange={(event) =>
                        setRegionFilter((prev) => ({ ...prev, startDate: event.target.value }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 pr-10 text-sm text-white shadow-inner shadow-white/10 transition focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-600/60"
                      style={{ colorScheme: "dark" }}
                    />
                    <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-200 opacity-80" />
                  </div>
                </label>
                <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                  End Date
                  <div className="relative mt-2 w-48">
                    <input
                      type="date"
                      value={regionFilter.endDate}
                      onChange={(event) =>
                        setRegionFilter((prev) => ({ ...prev, endDate: event.target.value }))
                      }
                      className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 pr-10 text-sm text-white shadow-inner shadow-white/10 transition focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-600/60"
                      style={{ colorScheme: "dark" }}
                    />
                    <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-200 opacity-80" />
                  </div>
                </label>
                <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                  Status
                  <select
                    value={regionFilter.status}
                    onChange={(event) =>
                      setRegionFilter((prev) => ({ ...prev, status: event.target.value }))
                    }
                    className="mt-2 w-52 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white shadow-inner shadow-white/10 transition focus:border-blue-700 focus:outline-none focus:ring-1 focus:ring-blue-600/60"
                  >
                    <option value="all">All statuses</option>
                    {availableStatuses.map((status) => (
                      <option key={status} value={status}>
                        {formatStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                  Region Focus
                  <button
                    type="button"
                    onClick={() => setActiveRegionPicker("region")}
                    className="mt-2 w-52 rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-left text-sm text-white shadow-inner shadow-white/10 transition hover:border-blue-700/40 focus:border-blue-600 focus:outline-none focus:ring-1 focus:ring-blue-600/60"
                  >
                    <span className="block truncate">{getFilterRegionLabel(regionFilter)}</span>
                  </button>
                </label>
                <button
                  type="button"
                  onClick={() => setRegionFilter(createFilterState())}
                  disabled={!isRegionFilterActive}
                  className={`ml-auto rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                    isRegionFilterActive
                      ? "border-blue-700/40 bg-blue-700/15 text-blue-200 hover:bg-blue-700/25 hover:shadow-[0_0_25px_rgba(37,99,235,0.4)]"
                      : "cursor-not-allowed border-white/10 bg-white/[0.04] text-gray-500"
                  }`}
                >
                  Reset
                </button>
              </div>
              <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_0_45px_rgba(30,64,175,0.35)]">
                <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-900/20 via-transparent to-sky-900/25" />
                <ReactECharts
                  option={barOption}
                  style={{ height: 360, width: "100%" }}
                  notMerge
                  lazyUpdate
                />
              </div>
            </div>
          </ChartModal>
        )}

      {/* Gradient background */}
      <div className="absolute inset-0 w-full min-h-full bg-gradient-to-br from-black via-gray-900 to-black -z-20" />
        {/*  Globe Background */}
        <GlobeBackground interactive={clearMode} globePoints={globePoints} />
   
        {/*  Clear Button */}
        <div className="absolute top-20 right-4 z-20">
          <button
            onClick={() => setClearMode(!clearMode)}
            className="group relative overflow-hidden rounded-full border border-white/10 bg-gradient-to-r from-blue-900/95 via-slate-900/90 to-indigo-900/90 px-5 py-2 text-sm font-semibold tracking-wide text-white shadow-lg shadow-[0_15px_35px_rgba(15,23,42,0.55)] transition-all duration-300 hover:-translate-y-0.5"
          >
            <span className="relative z-10">
              {clearMode ? "Back to Dashboard" : "Clear (Explore Globe)"}
            </span>
            <span className="absolute inset-0 bg-gradient-to-r from-white/10 via-transparent to-white/20 opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
          </button>
        </div>
  
        {/* Main Content (hidden when clearMode is true) */}
        {!clearMode && (
          <div className="flex-grow flex flex-col relative z-10">
            {/* Navbar */}
            <nav className="mx-6 mt-6 flex items-center justify-between rounded-3xl border border-white/10 bg-gradient-to-br from-black/75 via-slate-900/65 to-black/75 px-6 py-4 font-sans shadow-xl shadow-[0_25px_65px_rgba(8,11,24,0.6)] backdrop-blur-xl">
              <div className="flex items-center gap-4">
                <button
                  type="button"
                  onClick={() => setShowMenu(!showMenu)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] text-xl text-white shadow-inner shadow-white/5 transition hover:bg-white/10"
                  aria-label="Toggle navigation"
                >
                  &#9776;
                </button>
                <img src={adfLogo} alt="ADF Logo" className="h-10 w-auto drop-shadow-[0_10px_20px_rgba(59,130,246,0.35)]" />
              </div>

              <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center space-x-2 text-3xl font-extrabold">
                <img src={trackxLogo} alt="TrackX Logo Left" className="h-8 w-auto opacity-90" />
                <span className="text-white/75 tracking-[0.2em] drop-shadow-[0_2px_12px_rgba(15,23,42,0.55)]">TRACKX</span>
                <img src={trackxLogo} alt="TrackX Logo Right" className="h-8 w-auto opacity-90" />
              </div>

              <div className="flex items-center space-x-6 text-sm text-gray-200">
                <Link to="/home" className="rounded-full bg-white/[0.02] px-3 py-1.5 font-medium text-white transition hover:bg-white/15">
                  Home
                </Link>
                <NotificationBell className="hidden lg:inline-flex" />
                <div className="flex flex-col items-end">
                  <span className="text-base font-semibold text-white">
                    {profile ? profile.firstName : "Loading..."}
                  </span>
                  <button
                    onClick={handleSignOut}
                    className="text-xs text-gray-400 transition hover:text-white"
                  >
                    Sign Out
                  </button>
                </div>
                <div className="rounded-full bg-white/[0.02] px-3 py-1.5 text-xs font-medium text-gray-400 shadow-inner shadow-white/5">
                  {formattedDateTime}
                </div>
              </div>
            </nav>
            {showMenu && (
              <div className="absolute left-4 top-32 z-30 w-64 space-y-2 rounded-3xl border border-white/10 bg-gradient-to-br from-slate-950/82 via-slate-900/78 to-black/78 p-6 shadow-2xl shadow-[0_30px_60px_rgba(30,58,138,0.45)] backdrop-blur-2xl">
                <div className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-white bg-white/[0.018]">
                  <HomeIcon className="w-4 h-4" />
                  Home
                </div>
                <Link
                  to="/new-case"
                  className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
                  onClick={() => setShowMenu(false)}
                >
                  <FilePlus2 className="w-4 h-4" />
                  Create New Case
                </Link>

                {profile?.role === "admin" && (
                  <Link
                    to="/manage-cases"
                    className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
                    onClick={() => setShowMenu(false)}
                  >
                    <FolderOpen className="w-4 h-4" />
                    Manage Cases
                  </Link>
                )}

                {profile?.role === "admin" && (
                  <Link
                    to="/trash-bin"
                    className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 transition hover:text-white hover:bg-white/10"
                    onClick={() => setShowMenu(false)}
                  >
                    <Trash2 className="w-4 h-4" />
                    Trash Bin
                  </Link>
                )}

                <Link
                  to="/my-cases"
                  className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
                  onClick={() => setShowMenu(false)}
                >
                  <Briefcase className="w-4 h-4" />
                  My Cases
                </Link>

                {profile?.role === "admin" && (
                  <Link
                    to="/pending-users"
                    className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
                    onClick={() => setShowMenu(false)}
                  >
                    <Users className="w-4 h-4" />
                    Pending Users
                  </Link>
                )}

                {profile?.role === "admin" && (
                  <Link
                    to="/admin-dashboard"
                    className="flex items-center gap-3 px-3 py-2 rounded-2xl text-sm font-medium text-gray-200 hover:text-white hover:bg-white/10 transition"
                    onClick={() => setShowMenu(false)}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Admin Dashboard
                  </Link>
                )}
              </div>
            )}
  
            <main className="flex w-full flex-col items-center px-6 pb-16 pt-10 space-y-12">
              <div className="relative w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-8 py-10 text-white shadow-[0_30px_80px_rgba(15,23,42,0.45)] backdrop-blur-xl">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-900/25 via-transparent to-purple-900/25" />
                <div className="absolute -top-16 right-10 h-44 w-44 rounded-full bg-blue-950/20 blur-3xl" />
                <div className="absolute -bottom-24 left-6 h-44 w-44 rounded-full bg-purple-950/18 blur-3xl" />
                <div className="relative flex flex-col gap-8 text-center sm:flex-row sm:items-center sm:justify-between sm:text-left">
                  <div className="space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.35em] text-gray-300">
                      Operational Intelligence
                    </p>
                    <h1 className="text-3xl font-semibold sm:text-4xl">Let&apos;s track the case.</h1>
                    <p className="max-w-xl text-sm text-gray-300">
                      Stay in control of investigations with live insights, polished visuals, and an immersive globe
                      experience inspired by our refined notifications.
                    </p>
                  </div>
                  <div className="flex flex-col items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.018] px-6 py-5 text-sm text-gray-200 shadow-inner shadow-white/10 backdrop-blur-2xl">
                    <span className="text-xs uppercase tracking-[0.3em] text-gray-400">Snapshot</span>
                    <span className="text-lg font-semibold text-white">{formattedDate}</span>
                    <span className="text-sm text-gray-300">{formattedTime}</span>
                    <span className="text-xs text-gray-400">{userRoleLabel}</span>
                  </div>
                </div>
              </div>

              <div className="relative w-full max-w-6xl overflow-hidden rounded-3xl border border-white/10 bg-white/[0.02] px-8 py-8 text-white shadow-[0_25px_70px_rgba(15,23,42,0.42)] backdrop-blur-xl">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-900/18 via-transparent to-indigo-900/18" />
                <div className="absolute -top-20 left-8 h-36 w-36 rounded-full bg-blue-900/35 blur-3xl" />
                <div className="absolute -bottom-24 right-8 h-36 w-36 rounded-full bg-purple-900/25 blur-3xl" />
                <div className="relative flex flex-col gap-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.35em] text-gray-400">
                        Filters
                      </p>
                      <h2 className="mt-2 text-xl font-semibold">Dashboard Filters</h2>
                      <p className="mt-1 max-w-2xl text-xs text-gray-300">
                        Narrow the entire dashboard by date, region, or status. Individual charts can still layer extra refinements in their expanded view.
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {isGlobalFilterActive ? (
                        <span className="inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-blue-100 shadow-[0_0_25px_rgba(37,99,235,0.35)]">
                          Active
                        </span>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => setGlobalFilter(createFilterState())}
                        disabled={!isGlobalFilterActive}
                        className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] transition ${
                          isGlobalFilterActive
                            ? "border-blue-500/40 bg-blue-500/10 text-blue-100 hover:bg-blue-500/20 hover:shadow-[0_0_25px_rgba(37,99,235,0.35)]"
                            : "cursor-not-allowed border-white/10 bg-white/[0.04] text-gray-500"
                        }`}
                      >
                        Reset
                      </button>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
                    <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                      Start Date
                      <div className="relative mt-2">
                        <input
                          type="date"
                          value={globalFilter.startDate}
                          onChange={(event) =>
                            setGlobalFilter((prev) => ({ ...prev, startDate: event.target.value }))
                          }
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 pr-10 text-sm text-white shadow-inner shadow-white/10 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                          style={{ colorScheme: "dark" }}
                        />
                        <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-200 opacity-80" />
                      </div>
                    </label>
                    <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                      End Date
                      <div className="relative mt-2">
                        <input
                          type="date"
                          value={globalFilter.endDate}
                          onChange={(event) =>
                            setGlobalFilter((prev) => ({ ...prev, endDate: event.target.value }))
                          }
                          className="w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 pr-10 text-sm text-white shadow-inner shadow-white/10 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                          style={{ colorScheme: "dark" }}
                        />
                        <Calendar className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-blue-200 opacity-80" />
                      </div>
                    </label>
                    <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                      Region
                      <button
                        type="button"
                        onClick={() => setActiveRegionPicker("global")}
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-left text-sm text-white shadow-inner shadow-white/10 transition hover:border-blue-500/40 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                      >
                        <span className="block truncate">{getFilterRegionLabel(globalFilter)}</span>
                      </button>
                    </label>
                    <label className="flex flex-col text-[11px] font-semibold uppercase tracking-[0.25em] text-gray-400">
                      Status
                      <select
                        value={globalFilter.status}
                        onChange={(event) =>
                          setGlobalFilter((prev) => ({ ...prev, status: event.target.value }))
                        }
                        className="mt-2 w-full rounded-xl border border-white/10 bg-black/40 px-3 py-2 text-sm text-white shadow-inner shadow-white/10 transition focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500/60"
                      >
                        <option value="all">All statuses</option>
                        {availableStatuses.map((status) => (
                          <option key={status} value={status}>
                            {formatStatusLabel(status)}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </div>
              </div>

              <div className="grid w-full max-w-5xl grid-cols-1 gap-4 md:grid-cols-3">
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(37,99,235,0.45)] backdrop-blur-xl">
                  <div className="pointer-events-none absolute -top-14 right-0 h-28 w-28 rounded-full bg-blue-950/25 blur-2xl" />
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Total Cases</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{totalCases}</p>
                  <p className="text-xs text-gray-400">Across all statuses tracked</p>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(15,118,110,0.4)] backdrop-blur-xl">
                  <div className="pointer-events-none absolute -top-16 left-0 h-28 w-28 rounded-full bg-teal-900/25 blur-2xl" />
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Active Investigations</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{activeCases}</p>
                  <p className="text-xs text-gray-400">Not started &amp; in progress matters</p>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(88,28,135,0.45)] backdrop-blur-xl">
                  <div className="pointer-events-none absolute -bottom-14 right-2 h-28 w-28 rounded-full bg-purple-950/25 blur-2xl" />
                  <p className="text-xs uppercase tracking-[0.3em] text-gray-400">Completion Rate</p>
                  <p className="mt-3 text-3xl font-semibold text-white">{completionRate}%</p>
                  <p className="text-xs text-gray-400">Cases successfully resolved</p>
                </div>
              </div>

              <div className="grid w-full max-w-6xl grid-cols-1 gap-8 md:grid-cols-2">
                <div
                  className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(37,99,235,0.45)] backdrop-blur-xl ${
                    expandedChart === "status"
                      ? "ring-1 ring-blue-500/40 shadow-[0_0_45px_rgba(37,99,235,0.55)]"
                      : ""
                  }`}
                >
                  <div className="pointer-events-none absolute -top-20 right-0 h-32 w-32 rounded-full bg-blue-950/25 blur-3xl" />
                  <button
                    type="button"
                    onClick={() => setExpandedChart("status")}
                    className="group absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/[0.04] text-white/80 transition-all duration-300 hover:bg-blue-500/25 hover:text-white hover:shadow-[0_0_25px_rgba(59,130,246,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400/80"
                    aria-label="Expand resolution status chart"
                  >
                    <Maximize2 className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                  </button>
                  <h3 className="text-lg font-semibold text-white">Resolution Status</h3>
                  <p className="mt-1 text-xs text-gray-400">Understand how each case is progressing at a glance.</p>
                  {statusCardFiltered ? (
                    <span className="mt-3 inline-flex items-center rounded-full border border-blue-500/30 bg-blue-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-blue-200">
                      Filtered
                    </span>
                  ) : null}
                  <ReactECharts
                    option={pieOption}
                    style={{ height: 260, width: "100%" }}
                    notMerge
                    lazyUpdate
                  />
                </div>
                <div
                  className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(30,64,175,0.45)] backdrop-blur-xl ${
                    expandedChart === "trend"
                      ? "ring-1 ring-indigo-500/40 shadow-[0_0_45px_rgba(76,29,149,0.55)]"
                      : ""
                  }`}
                >
                  <div className="pointer-events-none absolute -top-12 left-0 h-32 w-32 rounded-full bg-blue-950/22 blur-3xl" />
                  <button
                    type="button"
                    onClick={() => setExpandedChart("trend")}
                    className="group absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/[0.04] text-white/80 transition-all duration-300 hover:bg-indigo-500/25 hover:text-white hover:shadow-[0_0_25px_rgba(129,140,248,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/80"
                    aria-label="Expand case distribution chart"
                  >
                    <Maximize2 className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                  </button>
                  <h3 className="text-lg font-semibold text-white">Case Distribution Over Time</h3>
                  <p className="mt-1 text-xs text-gray-400">Track momentum across the year and anticipate trends.</p>
                  {trendCardFiltered ? (
                    <span className="mt-3 inline-flex items-center rounded-full border border-indigo-500/30 bg-indigo-500/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-indigo-100">
                      Filtered
                    </span>
                  ) : null}
                  <ReactECharts
                    option={lineOption}
                    style={{ height: 240, width: "100%" }}
                    notMerge
                    lazyUpdate
                  />
                </div>
              </div>

              <div className="relative w-full max-w-5xl overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 text-white shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] backdrop-blur-xl">
                <div className="pointer-events-none absolute -top-24 right-6 h-32 w-32 rounded-full bg-blue-950/18 blur-3xl" />
                <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Recent Cases</h2>
                    <p className="mt-1 text-xs text-gray-400">Quickly jump back into ongoing investigations.</p>
                  </div>
                  <div className="flex gap-4 text-sm">
                    <label className="flex items-center space-x-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-gray-200">
                      <input
                        type="checkbox"
                        checked={sortBy === "dateEntered"}
                        onChange={() => setSortBy("dateEntered")}
                        className="h-4 w-4 rounded border-white/20 bg-black/40 text-blue-500 focus:ring-blue-400"
                      />
                      <span>Date Entered</span>
                    </label>
                    <label className="flex items-center space-x-2 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-gray-200">
                      <input
                        type="checkbox"
                        checked={sortBy === "dateOfIncident"}
                        onChange={() => setSortBy("dateOfIncident")}
                        className="h-4 w-4 rounded border-white/20 bg-black/40 text-blue-500 focus:ring-blue-400"
                      />
                      <span>Date of Incident</span>
                    </label>
                  </div>
                </div>
                <ul className="mt-6 space-y-3">
                  {filteredRecentCases.length > 0 ? (
                    filteredRecentCases.map((caseItem, index) => (
                      <li
                        key={index}
                        className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/15 px-4 py-3 text-sm shadow-inner shadow-white/5 transition hover:border-blue-500/40 hover:bg-white/10"
                      >
                        <div className="flex flex-col">
                          <span className="font-semibold text-white">{caseItem.caseTitle}</span>
                          <span className="text-xs text-gray-400">{caseItem.dateEntered || caseItem.dateOfIncident || "No date available"}</span>
                        </div>
                        <Link
                          to="/edit-case"
                          state={{ caseData: { ...caseItem, doc_id: caseItem.doc_id } }}
                          className="flex items-center gap-2 rounded-full border border-white/10 bg-gradient-to-r from-blue-950/85 to-indigo-900/85 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white shadow shadow-[0_12px_30px_rgba(15,23,42,0.6)] transition hover:from-blue-800 hover:to-purple-900"
                        >
                          Manage
                          <span aria-hidden="true">→</span>
                        </Link>
                      </li>
                    ))
                  ) : (
                    <p className="rounded-2xl border border-dashed border-white/20 bg-white/[0.018] py-6 text-center text-sm text-gray-400">
                      No recent cases match the selected filters.
                    </p>
                  )}
                </ul>
              </div>

              <Link
                to="/new-case"
                className="group relative flex items-center gap-3 overflow-hidden rounded-full border border-white/10 bg-gradient-to-r from-blue-900 via-indigo-900 to-purple-900 px-8 py-3 text-lg font-semibold text-white shadow-xl shadow-[0_30px_80px_rgba(15,23,42,0.7)] transition-transform duration-300 hover:-translate-y-1"
              >
                <span className="relative z-10 text-2xl">＋</span>
                <span className="relative z-10">Create New Case / Report</span>
                <span className="absolute inset-0 translate-x-[-120%] bg-white/20 opacity-0 transition-all duration-500 group-hover:translate-x-[120%] group-hover:opacity-50" />
              </Link>

              <div className="grid w-full max-w-6xl grid-cols-1 gap-8 md:grid-cols-2">
                <div
                  className={`relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(37,99,235,0.45)] backdrop-blur-xl ${
                    expandedChart === "region"
                      ? "ring-1 ring-blue-600/40 shadow-[0_0_45px_rgba(30,64,175,0.55)]"
                      : ""
                  }`}
                >
                  <div className="pointer-events-none absolute -top-16 right-2 h-32 w-32 rounded-full bg-blue-900/25 blur-3xl" />
                  <button
                    type="button"
                    onClick={() => setExpandedChart("region")}
                    className="group absolute right-6 top-6 flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-white/[0.04] text-white/80 transition-all duration-300 hover:bg-blue-600/25 hover:text-white hover:shadow-[0_0_25px_rgba(37,99,235,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/80"
                    aria-label="Expand case frequency chart"
                  >
                    <Maximize2 className="h-5 w-5 transition-transform duration-300 group-hover:scale-110" />
                  </button>
                  <h3 className="text-lg font-semibold text-white">Case Frequency by Region</h3>
                  <p className="mt-1 text-xs text-gray-400">Identify hotspots and scale resources where needed.</p>
                  {regionCardFiltered ? (
                    <span className="mt-3 inline-flex items-center rounded-full border border-blue-600/30 bg-blue-600/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.35em] text-blue-100">
                      Filtered
                    </span>
                  ) : null}
                  <ReactECharts
                    option={barOption}
                    style={{ height: 240, width: "100%" }}
                    notMerge
                    lazyUpdate
                  />
                </div>

                <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.02] p-6 shadow-lg shadow-[0_20px_45px_rgba(15,23,42,0.42)] transition-transform duration-300 hover:-translate-y-1 hover:shadow-[0_32px_70px_rgba(76,29,149,0.45)] backdrop-blur-xl">
                  <div className="pointer-events-none absolute -bottom-16 left-2 h-32 w-32 rounded-full bg-indigo-900/25 blur-3xl" />
                  <h3 className="text-lg font-semibold text-white">Vehicle Movement Heatmap</h3>
                  <p className="mt-1 text-xs text-gray-400">Visualise the latest movement patterns at a glance.</p>
                  <MiniHeatMapWindow points={heatPoints} />
                </div>
              </div>
            </main>
          </div>
        )}
        <RegionSelectorModal
          isOpen={Boolean(activeRegionPicker)}
          onClose={() => setActiveRegionPicker(null)}
          onSelect={handleRegionSelection}
        />
      </div>
    );
  }
  
  export default HomePage;

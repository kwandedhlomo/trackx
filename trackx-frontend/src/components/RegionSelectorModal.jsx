import React, { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import ZA_REGIONS from "../data/za_regions";

function RegionSelectorModal({ isOpen, onClose, onSelect }) {
  const [step, setStep] = useState(1);
  const [selectedProvince, setSelectedProvince] = useState(null);
  const [districtQuery, setDistrictQuery] = useState("");

  const districts = useMemo(() => {
    if (!selectedProvince) return [];
    const q = districtQuery.trim().toLowerCase();
    const list = selectedProvince.districts || [];
    return q ? list.filter(d => d.name.toLowerCase().includes(q)) : list;
  }, [selectedProvince, districtQuery]);

  if (!isOpen) return null;

  const modal = (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60">
      <div className="w-full max-w-2xl rounded-2xl border border-white/10 bg-gradient-to-br from-slate-950/95 via-slate-900/85 to-black/85 p-6 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold text-white">Select Region</h3>
          <button
            className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-sm text-gray-200 hover:bg-white/20"
            onClick={() => {
              setStep(1);
              setSelectedProvince(null);
              setDistrictQuery("");
              onClose?.();
            }}
          >
            Close
          </button>
        </div>

        {step === 1 && (
          <div>
            <p className="mb-3 text-sm text-gray-300">Choose a province.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {ZA_REGIONS.map((p) => (
                <button
                  key={p.code}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-left text-white hover:bg-white/[0.08]"
                  onClick={() => { setSelectedProvince(p); setStep(2); }}
                >
                  <span>{p.name}</span>
                  <span className="text-xs text-gray-400">{(p.districts || []).length} districts</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && selectedProvince && (
          <div>
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-400">Province</p>
                <p className="text-base font-medium text-white">{selectedProvince.name}</p>
              </div>
              <button
                className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs text-gray-200 hover:bg-white/20"
                onClick={() => setStep(1)}
              >
                Change
              </button>
            </div>

            <label className="mb-1 block text-xs font-medium text-gray-400">Search districts (optional)</label>
            <input
              type="text"
              value={districtQuery}
              onChange={(e) => setDistrictQuery(e.target.value)}
              placeholder="Type to filter magisterial districts"
              className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-white placeholder-gray-500 focus:border-blue-700/50 focus:outline-none focus:ring-2 focus:ring-blue-700/30"
            />

            <div className="max-h-80 overflow-y-auto rounded-xl border border-white/10 bg-white/[0.02]">
              {districts.length === 0 ? (
                <p className="p-4 text-sm text-gray-400">No districts match your search.</p>
              ) : (
                districts.map((d) => (
                  <button
                    key={d.code}
                    className="flex w-full items-center justify-between border-b border-white/5 px-4 py-3 text-left text-sm text-white hover:bg-white/[0.06]"
                    onClick={() => {
                      onSelect?.({
                        provinceCode: selectedProvince.code,
                        provinceName: selectedProvince.name,
                        districtCode: String(d.code),
                        districtName: d.name,
                      });
                      setStep(1);
                      setSelectedProvince(null);
                      setDistrictQuery("");
                      onClose?.();
                    }}
                  >
                    <span>{d.name}</span>
                    <span className="text-xs text-gray-400">{d.code}</span>
                  </button>
                ))
              )}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <button
                className="text-xs text-gray-300 hover:text-white"
                onClick={() => {
                  onSelect?.({
                    provinceCode: selectedProvince.code,
                    provinceName: selectedProvince.name,
                    districtCode: null,
                    districtName: null,
                  });
                  setStep(1);
                  setSelectedProvince(null);
                  setDistrictQuery("");
                  onClose?.();
                }}
              >
                Use province only
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}

export default RegionSelectorModal;

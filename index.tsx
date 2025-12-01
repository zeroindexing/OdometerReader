import React, { useState, useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { GoogleGenAI } from "@google/genai";
import Chart from "chart.js/auto";

interface Reading {
  id: string;
  value: number;
  date: string;
}

const generateId = () => Math.random().toString(36).substr(2, 9);

const formatDate = (isoString: string) => {
  const d = new Date(isoString);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const App = () => {
  // overall states
  const [readings, setReadings] = useState<Reading[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"table" | "chart">("table");
  const [zeroReadings, setZeroReadings] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const chartRef = useRef<HTMLCanvasElement>(null);
  const chartInstance = useRef<Chart | null>(null);

  // for file uploads
  const fileInputRef = useRef<HTMLInputElement>(null);

  // localstorage
  useEffect(() => {
    const stored = localStorage.getItem("odometer_readings");
    if (stored) {
      try {
        setReadings(JSON.parse(stored));
      } catch (e) {
        console.error("Failed to parse readings", e);
      }
    }
  }, []);

  // save updates to localstorage
  useEffect(() => {
    localStorage.setItem("odometer_readings", JSON.stringify(readings));
  }, [readings]);

  const sortedReadings = [...readings].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  const initialReading = sortedReadings.length > 0 ? sortedReadings[0].value : 0;

  const displayReadings = sortedReadings.map((r) => ({
    ...r,
    displayValue: zeroReadings ? r.value - initialReading : r.value,
  }));


  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    setErrorMsg(null);

    // get api key from vercel
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      setErrorMsg("Configuration Error: API_KEY is missing. Please check your environment variables.");
      setLoading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    try {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = async () => {
        const base64Data = (reader.result as string).split(",")[1];
        const mimeType = file.type;

        const ai = new GoogleGenAI({ apiKey: apiKey });
        
        try {
          const response = await ai.models.generateContent({
            model: "gemini-2.5-flash",
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType: mimeType,
                    data: base64Data,
                  },
                },
                {
                  /* VERY IMPORTANT: Prompt for Gemini image comprehension */
                  text: "The uploaded picture should be a photo of a car odometer. Your task is to read the 6 digits displayed and output them in text. Format you response as a single 6 digit number, with no other characters or commentary. If you are unable to read the ones place digit, approximate. If you are unable to read the whole number, return '-1'",
                },
              ],
            },
          });

          const text = response.text?.trim();
          const numberValue = parseInt(text || "-1", 10);

          if (!text || numberValue === -1 || isNaN(numberValue)) {
            setErrorMsg("Could not read odometer. Please try a clearer photo.");
          } else {
            const newReading: Reading = {
              id: generateId(),
              value: numberValue,
              date: new Date().toISOString(),
            };
            setReadings((prev) => [...prev, newReading]);
          }
        } catch (err) {
          console.error(err);
          setErrorMsg("Error processing image with AI.");
        } finally {
          setLoading(false);
          if (fileInputRef.current) fileInputRef.current.value = "";
        }
      };
    } catch (err) {
      console.error(err);
      setErrorMsg("Error reading file.");
      setLoading(false);
    }
  };

  const clearAllReadings = () => {
    setReadings([]);
    setShowClearConfirm(false);
    localStorage.removeItem("odometer_readings");
  };

  // chart
  useEffect(() => {
    if (view === "chart" && chartRef.current) {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }

      const ctx = chartRef.current.getContext("2d");
      if (ctx) {
        chartInstance.current = new Chart(ctx, {
          type: "line",
          data: {
            labels: displayReadings.map((r) => formatDate(r.date)),
            datasets: [
              {
                label: zeroReadings ? "Distance Traveled" : "Odometer Reading",
                data: displayReadings.map((r) => r.displayValue),
                borderColor: "#3b82f6",
                backgroundColor: "rgba(59, 130, 246, 0.2)",
                borderWidth: 2,
                pointBackgroundColor: "#60a5fa",
                pointRadius: 4,
                tension: 0.1,
                fill: true,
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: {
                labels: { color: "#e2e8f0" },
              },
            },
            scales: {
              x: {
                ticks: { color: "#94a3b8" },
                grid: { color: "#334155" },
              },
              y: {
                ticks: { color: "#94a3b8" },
                grid: { color: "#334155" },
              },
            },
          },
        });
      }
    }
    return () => {
      if (chartInstance.current) {
        chartInstance.current.destroy();
      }
    };
  }, [view, displayReadings, zeroReadings]);

  // rendering
  return (
    <div className="flex flex-col h-full max-w-md mx-auto w-full bg-slate-950 text-slate-100 shadow-2xl overflow-hidden relative border-x border-slate-800">
      {/* header */}
      <header className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-950/80 backdrop-blur-sm sticky top-0 z-10">
        <h1 className="text-xl font-bold tracking-tight text-white">
          Odometer Tracker
        </h1>
        <div className="text-xs text-slate-500 font-mono">v1.0</div>
      </header>

      {/* main area */}
      <main className="flex-1 overflow-y-auto p-4 space-y-6">
        
        {/* everything else */}
        <section className="flex flex-col items-center space-y-4">
          <input
            type="file"
            accept="image/*"
            className="hidden"
            ref={fileInputRef}
            onChange={handleFileUpload}
            capture="environment"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={loading}
            className={`w-full py-4 rounded-xl font-semibold shadow-lg transition-all transform active:scale-95 flex items-center justify-center gap-2
              ${
                loading
                  ? "bg-slate-700 text-slate-400 cursor-not-allowed"
                  : "bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white shadow-blue-900/20"
              }`}
          >
            {loading ? (
              <>
                <svg className="animate-spin h-5 w-5 mr-2 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Processing...
              </>
            ) : (
              <>
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Add a Reading
              </>
            )}
          </button>
          
          {errorMsg && (
            <div className="text-red-400 text-sm bg-red-900/20 p-3 rounded-lg w-full text-center border border-red-900/50">
              {errorMsg}
            </div>
          )}
        </section>

        {/* data area */}
        <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden shadow-sm">
          
          {/* tabs for selection */}
          <div className="grid grid-cols-2 p-1 bg-slate-800/50 border-b border-slate-800">
            <button
              onClick={() => setView("table")}
              className={`py-2 text-sm font-medium rounded-lg transition-colors ${
                view === "table"
                  ? "bg-slate-700 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Table
            </button>
            <button
              onClick={() => setView("chart")}
              className={`py-2 text-sm font-medium rounded-lg transition-colors ${
                view === "chart"
                  ? "bg-slate-700 text-white shadow"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Chart
            </button>
          </div>

          {/* reading zeroer */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800 bg-slate-900">
            <span className="text-sm text-slate-300 font-medium">Zero Readings</span>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={zeroReadings}
                onChange={() => setZeroReadings(!zeroReadings)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              <span className="ml-3 text-xs font-medium text-slate-400 w-6">
                {zeroReadings ? "On" : "Off"}
              </span>
            </label>
          </div>

          {/* main content area */}
          <div className="p-4 min-h-[300px]">
            {displayReadings.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-500 py-12">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 mb-2 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <p>No readings yet</p>
              </div>
            ) : view === "table" ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm text-left text-slate-300">
                  <thead className="text-xs text-slate-400 uppercase bg-slate-800/50">
                    <tr>
                      <th scope="col" className="px-4 py-3 rounded-l-lg">Date</th>
                      <th scope="col" className="px-4 py-3 rounded-r-lg text-right">
                        {zeroReadings ? "Distance" : "Reading"}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayReadings.map((reading, index) => (
                      <tr key={reading.id} className="border-b border-slate-800 hover:bg-slate-800/30 transition-colors">
                        <td className="px-4 py-3 font-medium whitespace-nowrap">
                          {formatDate(reading.date)}
                        </td>
                        <td className="px-4 py-3 text-right font-mono text-white">
                          {reading.displayValue.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="relative h-64 w-full">
                <canvas ref={chartRef} />
              </div>
            )}
          </div>
        </div>

      </main>

      {/* clear all button */}
      <footer className="p-6 bg-slate-950 border-t border-slate-800 mt-auto">
        <button
          onClick={() => setShowClearConfirm(true)}
          className="w-full py-3 text-red-500 border border-red-500/30 rounded-lg hover:bg-red-500/10 hover:border-red-500/50 transition-all font-medium text-sm"
        >
          Clear all readings
        </button>
      </footer>

      {/* confirm clear all */}
      {showClearConfirm && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl p-6 w-full max-w-sm">
            <h3 className="text-lg font-bold text-white mb-2">Clear History?</h3>
            <p className="text-slate-400 text-sm mb-6">
              Are you sure you want to delete all odometer readings? This action cannot be undone.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={clearAllReadings}
                className="flex-1 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium transition-colors"
              >
                Yes, Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);

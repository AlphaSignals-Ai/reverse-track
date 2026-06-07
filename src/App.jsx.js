import React, { useState, useRef } from "react";
import { extractTextFromImage } from "./utils/ocr";
import { detectNetworkFromText } from "./utils/networkDetector";
import { resolveTransaction } from "./utils/api";
import { shortAddress, shortHash } from "./utils/format";

// --- Simple Icons ---
const Icon = ({ path }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
    <path strokeLinecap="round" strokeLinejoin="round" d={path} />
  </svg>
);
const copyIcon = "M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z";
const searchIcon = "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z";
const resetIcon = "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15";

// --- Components ---
const StatCard = ({ label, value, hint, tone = "default" }) => {
  const tones = {
    default: "text-white",
    accent: "text-accent",
    blue: "text-accent2",
    danger: "text-danger"
  };
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
      <div className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</div>
      <div className={`mt-2 font-medium ${tones[tone]}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
};

const SectionTitle = ({ title, subtitle, action }) => (
  <div className="flex items-center justify-between pb-4 border-b border-white/10">
    <div>
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      {subtitle && <p className="text-sm text-slate-400">{subtitle}</p>}
    </div>
    {action && <div>{action}</div>}
  </div>
);

// --- Main App ---
export default function App() {
  const [file, setFile] = useState(null);
  const [ocrText, setOcrText] = useState("");
  const [ocrConfidence, setOcrConfidence] = useState(null);
  const [txHash, setTxHash] = useState("");
  const [network, setNetwork] = useState(null);
  const [txDetails, setTxDetails] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stage, setStage] = useState("Upload a transaction screenshot.");
  const [copied, setCopied] = useState("");

  const fileInputRef = useRef(null);

  const resetAll = (clearFile = false) => {
    if (clearFile) setFile(null);
    setOcrText("");
    setOcrConfidence(null);
    setTxHash("");
    setNetwork(null);
    setTxDetails(null);
    setError("");
    setCopied("");
  };

  const extractPotentialHash = (text) => {
    const hexMatch = text.match(/(?:0x)?[a-fA-F0-9]{64,66}/);
    if (hexMatch) return hexMatch[0];
    const b58Match = text.match(/[1-9A-HJ-NP-Za-km-z]{43,88}/);
    if (b58Match) return b58Match[0];
    return null;
  };

  const analyzeImage = async (imageFile = file) => {
    if (!imageFile) return;
    setLoading(true);
    resetAll(false);
    
    try {
      setStage("Scanning image for text (OCR)...");
      const ocrResult = await extractTextFromImage(imageFile, (m) => {
        if (m.status === "recognizing text") setStage(`Scanning: ${Math.round(m.progress * 100)}%`);
      });
      
      setOcrText(ocrResult.text);
      setOcrConfidence(ocrResult.confidence);

      setStage("Detecting Hash & Network...");
      const foundHash = extractPotentialHash(ocrResult.text);
      if (!foundHash) throw new Error("Could not find any valid Transaction Hash in the image.");
      
      setTxHash(foundHash);
      const detectedNet = detectNetworkFromText(ocrResult.text, foundHash);
      setNetwork(detectedNet);

      if (detectedNet.kind === "unknown") throw new Error("Detected hash, but cannot identify the blockchain network.");

      setStage(`Fetching from ${detectedNet.label}...`);
      const details = await resolveTransaction({ txHash: foundHash, network: detectedNet });
      setTxDetails(details);
      setStage("Analysis Complete.");
      
    } catch (err) {
      setError(err.message || "An error occurred during analysis.");
      setStage("Analysis Failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0];
    if (selected) {
      setFile(selected);
      analyzeImage(selected);
    }
  };

  const copy = (text, type) => {
    navigator.clipboard.writeText(text);
    setCopied(`Copied ${type}!`);
    setTimeout(() => setCopied(""), 2000);
  };

  const analysisReady = !!txDetails;

  return (
    <div className="min-h-screen bg-bg text-slate-100 p-4 md:p-8">
      <main className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="text-center py-8">
          <h1 className="text-4xl font-bold text-white mb-2">Crypto Tx Tracker</h1>
          <p className="text-slate-400">Reverse search crypto transactions locally using screenshots.</p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column - Upload & Status */}
          <section className="lg:col-span-1 space-y-6">
            <div className="glass rounded-[26px] border border-white/10 p-5 space-y-6">
              
              <div 
                className={`dropzone border-2 border-dashed border-white/20 rounded-2xl p-8 text-center cursor-pointer hover:border-accent/50 ${loading ? 'opacity-50 pointer-events-none' : ''}`}
                onClick={() => fileInputRef.current?.click()}
              >
                <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleFileChange} />
                <div className="text-sm font-medium text-white mb-1">
                  {file ? file.name : "Click or Drag Image Here"}
                </div>
                <div className="text-xs text-slate-400">{stage}</div>
              </div>

              <div className="space-y-4">
                <button
                  type="button"
                  onClick={() => copy(txHash, "hash")}
                  disabled={!txHash}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs uppercase tracking-[0.2em] text-slate-400">Extracted TxHash</span>
                    <Icon path={copyIcon} />
                  </div>
                  <div className="mono mt-2 break-all text-sm text-white">{txHash || "No hash yet"}</div>
                </button>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Detected network</div>
                  <div className="mt-2 text-sm text-white">{network?.label || "Not detected yet"}</div>
                  <div className="mt-1 text-xs leading-5 text-slate-400">{network?.reason || "Upload a screenshot to begin."}</div>
                </div>
              </div>

              {error && (
                <div className="rounded-2xl border border-danger/20 bg-danger/10 p-4 text-sm text-danger">
                  {error}
                </div>
              )}
            </div>
          </section>

          {/* Right Column - Results Dashboard */}
          <section className="lg:col-span-2 grid gap-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <StatCard
                label="Sender wallet"
                value={txDetails?.sender ? shortAddress(txDetails.sender, 12, 10) : "-"}
                hint={txDetails?.sender || "Sender address will appear here."}
                tone="accent"
              />
              <StatCard
                label="Receiver wallet"
                value={txDetails?.receiver ? shortAddress(txDetails.receiver, 12, 10) : "-"}
                hint={txDetails?.receiver || "Receiver address will appear here."}
                tone="blue"
              />
              <StatCard
                label="Amount"
                value={txDetails?.amount || "-"}
                hint={txDetails?.source ? `Source: ${txDetails.source}` : "Native or transferred amount."}
              />
              <StatCard
                label="Status"
                value={txDetails?.status || "-"}
                hint={txDetails?.blockNumber != null ? `Block: ${txDetails.blockNumber}` : "Transaction status"}
                tone={txDetails?.status === "Failed" ? "danger" : "default"}
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
              <div className="glass rounded-[26px] border border-white/10 p-5">
                <SectionTitle
                  title="Dashboard"
                  subtitle="Normalized transaction details and OCR output."
                  action={
                    <button
                      type="button"
                      onClick={() => analyzeImage()}
                      disabled={!file || loading}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white hover:bg-white/10 disabled:opacity-40"
                    >
                      <Icon path={searchIcon} /> Re-run
                    </button>
                  }
                />

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <StatCard label="Network" value={txDetails?.networkLabel || "-"} hint={txDetails?.chainName || "-"} />
                  <StatCard label="Explorer" value={txDetails?.explorerUrl ? shortHash(txDetails.explorerUrl, 18, 12) : "-"} hint="Click to open explorer (soon)" />
                  <StatCard label="Tx Hash" value={txHash ? shortHash(txHash, 14, 12) : "-"} hint="Click the hash card to copy." />
                  <StatCard label="OCR confidence" value={ocrConfidence == null ? "-" : `${Math.round(ocrConfidence)}%`} hint="Confidence from Tesseract.js" />
                </div>

                <div className="mt-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Raw OCR text</div>
                    <pre className="scrollbar mt-3 max-h-[220px] overflow-auto whitespace-pre-wrap break-words text-sm leading-6 text-slate-200">
                      {ocrText || "OCR output will appear here."}
                    </pre>
                  </div>
                </div>
              </div>

              <div className="glass rounded-[26px] border border-white/10 p-5">
                <SectionTitle
                  title="System Notes"
                  subtitle="Context about the detection."
                  action={
                    <button
                      type="button"
                      onClick={() => resetAll(true)}
                      className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-white hover:bg-white/10"
                    >
                      <Icon path={resetIcon} /> Clear
                    </button>
                  }
                />
                <div className="mt-4 space-y-3">
                  <StatCard label="Source" value={txDetails?.source || "-"} hint="API Fallback" />
                  <StatCard label="Support" value={analysisReady ? "Transaction resolved" : "Awaiting image"} hint="Client-side processing enabled." />
                  {copied && (
                    <div className="rounded-2xl border border-accent/20 bg-accent/10 px-4 py-3 text-sm text-accent">
                      {copied}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
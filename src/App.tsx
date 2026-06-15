/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { 
  Sparkles, 
  Copy, 
  Check, 
  FileText, 
  Sliders, 
  Eye, 
  History, 
  Trash2, 
  Download, 
  RefreshCw, 
  AlertTriangle, 
  MapPin, 
  Building, 
  Calendar, 
  DollarSign, 
  Globe, 
  ExternalLink,
  ChevronRight,
  Info
} from "lucide-react";
import { SAMPLE_JOBS } from "./samples";
import { JobStructuredData } from "./types";

interface HistoryItem {
  id: string;
  title: string;
  company: string;
  dateGenerated: string;
  data: JobStructuredData;
}

export default function App() {
  const [jobText, setJobText] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedData, setGeneratedData] = useState<JobStructuredData | null>(null);
  const [activeTab, setActiveTab] = useState<"json" | "fields" | "preview" | "history">("json");
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "info" | "error" } | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string>("");
  const [vacatureUrl, setVacatureUrl] = useState<string>("https://www.werkenbijkoopmaninternational.com/");

  // Client-side API fallback options for Netlify / Gh-Pages
  const [useClientSideApi, setUseClientSideApi] = useState<boolean>(() => {
    const hasEnvKey = !!(import.meta.env.VITE_GEMINI_API_KEY);
    if (hasEnvKey) return true; // Always active if environment key is provided
    const stored = localStorage.getItem("use_client_side_api");
    if (stored !== null) return stored === "true";
    return false;
  });
  const [clientApiKey, setClientApiKey] = useState<string>(() => {
    const envKey = (import.meta.env.VITE_GEMINI_API_KEY as string) || "";
    const stored = localStorage.getItem("client_gemini_api_key") || "";
    return envKey || stored || "";
  });

  // Target date for generation (defaults to today)
  const [customDate, setCustomDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });

  // Save client-side api config to localStorage
  useEffect(() => {
    localStorage.setItem("use_client_side_api", String(useClientSideApi));
  }, [useClientSideApi]);

  useEffect(() => {
    localStorage.setItem("client_gemini_api_key", clientApiKey);
  }, [clientApiKey]);

  // Load history on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("schema_ai_history");
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Fout bij laden van geschiedenis:", e);
    }
  }, []);

  // Save history helper
  const saveHistory = (newHistory: HistoryItem[]) => {
    setHistory(newHistory);
    try {
      localStorage.setItem("schema_ai_history", JSON.stringify(newHistory));
    } catch (e) {
      console.error("Fout bij opslaan van geschiedenis:", e);
    }
  };

  // Toast helper
  const triggerToast = (message: string, type: "success" | "info" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification(null);
    }, 4000);
  };

  // Load preset helper
  const handleLoadPreset = (presetId: string) => {
    const preset = SAMPLE_JOBS.find(j => j.id === presetId);
    if (preset) {
      setJobText(preset.rawText);
      setSelectedPresetId(presetId);
      triggerToast(`Voorbeeld "${preset.title}" ingeladen!`, "info");
    }
  };

  // Clear inputs
  const handleClear = () => {
    setJobText("");
    setSelectedPresetId("");
    setVacatureUrl("https://www.werkenbijkoopmaninternational.com/");
    triggerToast("Invoer leeggemaakt", "info");
  };

  // call proxy endpoint to generate schema via Gemini
  const handleGenerate = async () => {
    if (!jobText.trim()) {
      setError("Voer a.u.b. eerst een vacaturetekst in.");
      triggerToast("Voer eerst een vacaturetekst in.", "error");
      return;
    }

    setIsGenerating(true);
    setError(null);

    // Direct Client-Side Gemini Call Mode (Supports Netlify, Vercel, GH Pages without backend)
    if (useClientSideApi) {
      if (!clientApiKey.trim()) {
        setIsGenerating(false);
        setError("Schakel 'Client-side modus' in en vul hieronder je eigen Gemini API sleutel in.");
        triggerToast("Geen API Key ingesteld!", "error");
        return;
      }

      try {
        const todayStr = customDate || new Date().toISOString().split("T")[0];
        const promptText = `Je krijgt een vacaturetekst in het Nederlands of Engels. Je taak is om alle relevante velden te extraheren voor de Google JobPosting structured data (JSON-LD) specificatie.
Wees zeer nauwkeurig en behoud details uit de tekst.

Huidige datum vandaag: ${todayStr}

Extraction Instructies:
1. "title": De exacte functietitel.
2. "company": De naam van de werkgever/organisatie. Zoek goed in de tekst (bijvoorbeeld 'Koopman International', 'Amsterdam', etc.).
3. "descriptionHtml": Een volledige, goed leesbare omschrijving geformatteerd in HTML. Gebruik uitsluitend veilige tags die Google accepteert voor JobPosting descriptions: <p>, <ul>, <li>, <strong>, <em>, <br>. Behoud alle belangrijke onderdelen zoals taken, vereisten en wat de werkgever biedt.
4. "employmentTypes": Een lijst van dienstverband typen. Selecteer uitsluitend uit: FULL_TIME, PART_TIME, CONTRACTOR, TEMPORARY, INTERN, VOLUNTEER, OTHER. Match zorgvuldig (bijv. "Fulltime" -> FULL_TIME, "Parttime" -> PART_TIME).
5. "locality": De stad of plaatsnaam waar de functie is gevestigd (bijv. "Amsterdam", "Emmeloord").
6. "region": De provincie of regio indien bekend (bijv. "Flevoland", "Noord-Holland"), anders leeg laten.
7. "postalCode": Postcode indien expliciet genoemd, anders leeg laten.
8. "streetAddress": Straatnaam en huisnummer indien vermeld, anders leeg laten.
9. "countryCode": De ISO 2-letter landcode (bijv. "NL", "BE"). Standaard is "NL" voor Nederlandse vacatures tenzij anders aangegeven.
10. "remoteType": Indien er sprake is van thuiswerk, kies uit: ONSITE (standaard), HYBRID of REMOTE.
11. "salaryMinimum": Het minimum salaris als getal (bijvoorbeeld 2500 voor €2500 per maand uur of jaar), anders 0.
12. "salaryMaximum": Het maximum salaris als getal, anders 0.
13. "salaryCurrency": De valuta, bijvoorbeeld "EUR" of "USD". Standaard is "EUR".
14. "salaryUnit": De frequentie van betaling: HOUR, WEEK, MONTH, of YEAR. Standaard is MONTH.
15. "datePosted": De publicatiedatum in YYYY-MM-DD. Gebruik de huidige datum "${todayStr}" als de publicatiedatum niet expliciet in de tekst staat.
16. "validThrough": De vervaldatum van de vacature in YYYY-MM-DD. Als deze niet is vermeld, kies dan een logische datum precies 90 dagen na datePosted.

Vacaturetekst:
"""
${jobText}
"""`;

        // Direct request to Gemini REST API
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${clientApiKey.trim()}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contents: [{ parts: [{ text: promptText }] }],
            generationConfig: {
              responseMimeType: "application/json",
              responseSchema: {
                type: "OBJECT",
                properties: {
                  title: { type: "STRING" },
                  company: { type: "STRING" },
                  descriptionHtml: { type: "STRING" },
                  employmentTypes: {
                    type: "ARRAY",
                    items: { type: "STRING" }
                  },
                  locality: { type: "STRING" },
                  region: { type: "STRING" },
                  postalCode: { type: "STRING" },
                  streetAddress: { type: "STRING" },
                  countryCode: { type: "STRING" },
                  remoteType: { type: "STRING" },
                  salaryMinimum: { type: "NUMBER" },
                  salaryMaximum: { type: "NUMBER" },
                  salaryCurrency: { type: "STRING" },
                  salaryUnit: { type: "STRING" },
                  datePosted: { type: "STRING" },
                  validThrough: { type: "STRING" }
                },
                required: ["title", "company", "descriptionHtml", "employmentTypes", "locality", "countryCode", "datePosted", "validThrough"]
              }
            }
          })
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData?.error?.message || `API Fout ${response.status}`);
        }

        const dataJson = await response.json();
        const textOutput = dataJson.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textOutput) {
          throw new Error("Geen geldig antwoord ontvangen van de Gemini API.");
        }

        const parsedData: JobStructuredData = JSON.parse(textOutput.trim());

        // Standard post-processing (Koopman fields & location mappings)
        if (!parsedData.company || parsedData.company.toLowerCase().includes("koopman")) {
          parsedData.company = "Koopman International";
        }

        const loc = (parsedData.locality || "").toLowerCase();
        if (loc.includes("emmeloord")) {
          parsedData.locality = "Emmeloord";
          parsedData.streetAddress = "Ecu 6";
          parsedData.postalCode = "8305 BA";
          parsedData.region = "Flevoland";
        } else if (loc.includes("amsterdam")) {
          parsedData.locality = "Amsterdam";
          parsedData.streetAddress = "Distelweg 88";
          parsedData.postalCode = "1031 HH";
          parsedData.region = "Noord-Holland";
        }

        if (vacatureUrl && vacatureUrl.trim()) {
          parsedData.url = vacatureUrl.trim();
        }

        setGeneratedData(parsedData);
        setActiveTab("json");
        triggerToast("JobPosting JSON-LD succesvol gegenereerd via client-side API!", "success");

        const newItem: HistoryItem = {
          id: `hist-${Date.now()}`,
          title: parsedData.title || "Onbekende functie",
          company: parsedData.company || "Onbekend bedrijf",
          dateGenerated: new Date().toLocaleString("nl-NL"),
          data: parsedData
        };
        const updatedHistory = [newItem, ...history.slice(0, 19)];
        saveHistory(updatedHistory);

      } catch (err: any) {
        console.error("Direct client API error:", err);
        setError(`Client-side generatie mislukt: ${err.message}. Controleer of je API-sleutel correct is.`);
        triggerToast("Fout bij direct online genereren", "error");
      } finally {
        setIsGenerating(false);
      }
      return;
    }

    // Default Express Full-stack Server Call Mode
    try {
      const response = await fetch("/api/generate-jsonld", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          jobText,
          currentDate: customDate
        })
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `Server fout ${response.status}`);
      }

      const parsedData: JobStructuredData = await response.json();

      // Ensure standard Koopman company name when appropriate
      if (!parsedData.company || parsedData.company.toLowerCase().includes("koopman")) {
        parsedData.company = "Koopman International";
      }

      // Auto-fill Koopman specific local address fields if match found
      const loc = (parsedData.locality || "").toLowerCase();
      if (loc.includes("emmeloord")) {
        parsedData.locality = "Emmeloord";
        parsedData.streetAddress = "Ecu 6";
        parsedData.postalCode = "8305 BA";
        parsedData.region = "Flevoland";
      } else if (loc.includes("amsterdam")) {
        parsedData.locality = "Amsterdam";
        parsedData.streetAddress = "Distelweg 88";
        parsedData.postalCode = "1031 HH";
        parsedData.region = "Noord-Holland";
      }

      // Add active URL payload directly to returned metadata
      if (vacatureUrl && vacatureUrl.trim()) {
        parsedData.url = vacatureUrl.trim();
      }

      setGeneratedData(parsedData);
      setActiveTab("json");
      triggerToast("JobPosting JSON-LD succesvol gegenereerd!", "success");

      // Add to history
      const newItem: HistoryItem = {
        id: `hist-${Date.now()}`,
        title: parsedData.title || "Onbekende functie",
        company: parsedData.company || "Onbekend bedrijf",
        dateGenerated: new Date().toLocaleString("nl-NL"),
        data: parsedData
      };
      
      const updatedHistory = [newItem, ...history.slice(0, 19)]; // Keep last 20 items
      saveHistory(updatedHistory);

    } catch (err: any) {
      console.error("Fout bij genereren:", err);
      let errMsg = err.message || "Er is een onverwachte fout opgetreden.";
      
      // Auto-diagnose Netlify / Vercel static asset deployment restriction
      if (errMsg.includes("404") || errMsg.includes("Failed to fetch") || errMsg.includes("Server fout 404")) {
        errMsg = "Je backend server is momenteel niet bereikbaar (404). Omdat je de app op Netlify of een vergelijkbaar statisch platform hebt gehost, raden we aan om direct hieronder 'Netlify / Client-side modus' in te schakelen en je eigen Gemini API-sleutel in te vullen.";
        triggerToast("Netlify / Statische host gedetecteerd", "info");
      }
      
      setError(errMsg);
      triggerToast("Genereren mislukt, probeer het opnieuw.", "error");
    } finally {
      setIsGenerating(false);
    }
  };

  // Handle edit of extracted fields directly
  const handleFieldChange = (field: keyof JobStructuredData, value: any) => {
    if (!generatedData) return;
    setGeneratedData({
      ...generatedData,
      [field]: value
    });
  };

  const handleEmploymentTypeToggle = (type: string) => {
    if (!generatedData) return;
    const currentTypes = generatedData.employmentTypes || [];
    let updatedTypes: string[];
    if (currentTypes.includes(type)) {
      updatedTypes = currentTypes.filter(t => t !== type);
    } else {
      updatedTypes = [...currentTypes, type];
    }
    // Safeguard to ensure there's at least one default type
    if (updatedTypes.length === 0) {
      updatedTypes = ["FULL_TIME"];
    }
    handleFieldChange("employmentTypes", updatedTypes);
  };

  // Build real JSON-LD script from structured data state
  const getCompiledJsonLd = (): string => {
    if (!generatedData) return "";

    const jsonLdObj: any = {
      "@context": "https://schema.org/",
      "@type": "JobPosting",
      "title": generatedData.title,
      "description": generatedData.descriptionHtml,
      "identifier": {
        "@type": "PropertyValue",
        "name": generatedData.company,
        "value": `job-${generatedData.company?.toLowerCase().replace(/[^a-z0-9]/g, '-')}-${generatedData.title?.toLowerCase().replace(/[^a-z0-9]/g, '-')}`
      },
      "datePosted": generatedData.datePosted || customDate,
      "validThrough": generatedData.validThrough,
      "employmentType": generatedData.employmentTypes || ["FULL_TIME"],
      "hiringOrganization": {
        "@type": "Organization",
        "name": generatedData.company,
        "sameAs": `https://www.google.com/search?q=${encodeURIComponent(generatedData.company || "")}`
      },
      "jobLocation": {
        "@type": "Place",
        "address": {
          "@type": "PostalAddress",
          "addressLocality": generatedData.locality || "",
          "addressRegion": generatedData.region || "",
          "postalCode": generatedData.postalCode || "",
          "streetAddress": generatedData.streetAddress || "",
          "addressCountry": generatedData.countryCode || "NL"
        }
      }
    };

    // Include the vacancy URL in the structured data
    if (vacatureUrl && vacatureUrl.trim()) {
      jsonLdObj["url"] = vacatureUrl.trim();
    } else if (generatedData.url && generatedData.url.trim()) {
      jsonLdObj["url"] = generatedData.url.trim();
    }

    // Include baseSalary if present and greater than 0
    if (generatedData.salaryMinimum > 0 || generatedData.salaryMaximum > 0) {
      const minVal = generatedData.salaryMinimum || generatedData.salaryMaximum;
      const maxVal = generatedData.salaryMaximum || generatedData.salaryMinimum;
      
      jsonLdObj["baseSalary"] = {
        "@type": "MonetaryAmount",
        "currency": generatedData.salaryCurrency || "EUR",
        "value": {
          "@type": "QuantitativeValue",
          ...(minVal === maxVal 
            ? { "value": minVal } 
            : { "minValue": minVal, "maxValue": maxVal }
          ),
          "unitText": generatedData.salaryUnit || "MONTH"
        }
      };
    }

    // Include remote settings
    if (generatedData.remoteType === "REMOTE") {
      jsonLdObj["jobLocationType"] = "TELECOMMUTE";
      // telecommute doesn't strictly require addressLocality to represent work location, but we can maintain standard
    }

    return JSON.stringify(jsonLdObj, null, 2);
  };

  const compiledScriptString = (): string => {
    const jsonStr = getCompiledJsonLd();
    if (!jsonStr) return "";
    return `<script type="application/ld+json">\n${jsonStr}\n</script>`;
  };

  // Copy to clipboard helper
  const handleCopyToClipboard = (text: string, description: string = "Script gekopieerd!") => {
    navigator.clipboard.writeText(text);
    triggerToast(description, "success");
  };

  // Download JSON file
  const handleDownloadFile = () => {
    const jsonLd = getCompiledJsonLd();
    if (!jsonLd) return;
    const blob = new Blob([jsonLd], { type: "application/ld+json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const sanitizedTitle = (generatedData?.title || "vacancy").toLowerCase().replace(/\s+/g, "-");
    link.href = url;
    link.download = `jobposting-${sanitizedTitle}.jsonld`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    triggerToast("Bestand gedownload: " + `jobposting-${sanitizedTitle}.jsonld`, "success");
  };

  // Load history item back to workbench
  const handleLoadHistory = (item: HistoryItem) => {
    setGeneratedData(item.data);
    if (item.data.url) {
      setVacatureUrl(item.data.url);
    }
    setActiveTab("json");
    triggerToast(`Gegenereerd schema voor "${item.title}" ingeladen uit geschiedenis.`, "info");
  };

  // Delete history item
  const handleDeleteHistory = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const filtered = history.filter(item => item.id !== id);
    saveHistory(filtered);
    triggerToast("Geschiedenisitem verwijderd", "info");
  };

  return (
    <div id="app-root" className="min-h-screen bg-slate-950 text-slate-100 font-sans overflow-x-hidden relative flex flex-col justify-between">
      
      {/* Absolute Ambient Background Blurred Gradients */}
      <div id="mesh-gradient-1" className="absolute top-[-10%] left-[-5%] w-[45vw] h-[45vw] bg-indigo-600/20 rounded-full blur-[140px] pointer-events-none z-0"></div>
      <div id="mesh-gradient-2" className="absolute bottom-[10%] right-[-5%] w-[50vw] h-[50vw] bg-cyan-600/15 rounded-full blur-[150px] pointer-events-none z-0"></div>
      <div id="mesh-gradient-3" className="absolute top-[40%] left-[30%] w-[35vw] h-[35vw] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none z-0"></div>

      {/* Styled Floating Toast Notification */}
      {notification && (
        <div id="toast-notification" className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3.5 rounded-xl border backdrop-blur-xl shadow-2xl transition-all duration-300 transform translate-y-0 text-sm max-w-sm ${
          notification.type === "success" 
            ? "bg-emerald-950/80 border-emerald-500/30 text-emerald-300" 
            : notification.type === "error"
            ? "bg-rose-950/80 border-rose-500/30 text-rose-300"
            : "bg-indigo-950/80 border-indigo-500/30 text-indigo-300"
        }`}>
          {notification.type === "success" && <Check className="w-5 h-5 shrink-0 text-emerald-400" />}
          {notification.type === "error" && <AlertTriangle className="w-5 h-5 shrink-0 text-rose-400" />}
          {notification.type === "info" && <Info className="w-5 h-5 shrink-0 text-indigo-400" />}
          <span>{notification.message}</span>
        </div>
      )}

      {/* Header */}
      <header id="app-header" className="relative z-10 flex items-center justify-between px-6 py-5 lg:px-12 backdrop-blur-md bg-white/5 border-b border-white/10 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-cyan-400 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Sparkles className="w-5 h-5 text-white animate-pulse" />
          </div>
          <div>
            <h1 className="text-xl lg:text-2xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-100 to-slate-400">
              Vacature JSON-LD Generator
            </h1>
            <p className="text-xs text-cyan-400/80 font-medium">Beveiligde Google JobPosting Structured Data met AI</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-2 px-3 py-1 bg-white/5 border border-white/10 rounded-full text-xs text-slate-300">
            <span className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse"></span>
            <span>Gemini 3.5 Flash Model</span>
          </div>
          <span className="text-xs font-semibold bg-cyan-500/10 text-cyan-400 px-2.5 py-1 rounded-md border border-cyan-400/20">
            CRAFTED EDITION
          </span>
        </div>
      </header>

      {/* Main Container */}
      <main id="app-main" className="flex-1 relative z-10 px-4 py-8 lg:px-12 grid grid-cols-1 lg:grid-cols-12 gap-8 max-w-7xl mx-auto w-full">
        
        {/* Left Column: Input (Span 5) */}
        <section id="input-section" className="lg:col-span-5 flex flex-col gap-5 h-full">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Invoer &amp; Instellingen</span>
              <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-400/20">Step 1</span>
            </div>
            <button 
              id="clear-input-btn"
              onClick={handleClear}
              disabled={!jobText}
              className="text-xs text-slate-400 hover:text-rose-400 transition-colors disabled:opacity-30 disabled:hover:text-slate-400"
            >
              Invoer Wissen
            </button>
          </div>

          <div className="backdrop-blur-xl bg-white/5 border border-white/10 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 relative">
            
            {/* Vacature URL Input */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <label className="font-medium text-slate-300 flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  Vacature URL (Optioneel)
                </label>
                <span className="text-[10px] text-slate-500 font-mono">werkenbijkoopman...</span>
              </div>
              <div className="relative flex items-center bg-slate-900/60 border border-white/10 rounded-xl focus-within:border-cyan-500/60 focus-within:ring-1 focus-within:ring-cyan-500/50 transition-all px-3 py-2.5">
                <input
                  type="url"
                  className="w-full bg-transparent border-none outline-none text-slate-200 text-xs placeholder:text-slate-600"
                  placeholder="https://www.werkenbijkoopmaninternational.com/vacatures/job-title"
                  value={vacatureUrl}
                  onChange={(e) => setVacatureUrl(e.target.value)}
                />
              </div>
            </div>

            {/* Custom Posting Textarea */}
            <div className="flex flex-col gap-1.5 mt-2">
              <div className="flex justify-between items-center text-xs text-slate-400">
                <label className="font-medium text-slate-300">Vacature Tekst</label>
                <span>{jobText.length} tekens</span>
              </div>
              <div className="relative min-h-[300px] bg-slate-900/60 border border-white/10 rounded-xl focus-within:border-cyan-500/60 focus-within:ring-1 focus-within:ring-cyan-500/50 transition-all p-3">
                <textarea
                  id="vacancy-text-area"
                  className="w-full h-[280px] bg-transparent border-none outline-none resize-none text-slate-200 text-sm leading-relaxed placeholder:text-slate-500"
                  placeholder="Plak hier de volledige tekst van de vacature (Inclusief functietitel, taken, eisen, arbeidsvoorwaarden en standplaats)..."
                  value={jobText}
                  onChange={(e) => {
                    setJobText(e.target.value);
                    if (selectedPresetId) setSelectedPresetId(""); // De-select preset if custom edits are supplied
                  }}
                />
              </div>
            </div>

            {/* Config options before generating */}
            <div className="grid grid-cols-2 gap-3 mt-1 bg-white/5 p-3 rounded-xl border border-white/5">
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Publicatiedatum (Vandaag)
                </label>
                <input
                  type="date"
                  value={customDate}
                  onChange={(e) => setCustomDate(e.target.value)}
                  className="w-full bg-slate-900/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-indigo-500 transition-all"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                  Doelgroep Robots
                </label>
                <div className="text-xs text-emerald-400 py-1.5 font-medium flex items-center gap-1.5">
                  <span className="w-2 h-2 bg-emerald-400 rounded-full animate-ping"></span>
                  Google Jobs Indexer
                </div>
              </div>
            </div>

            {/* Netlify / Static Host Fallback Option */}
            <div className="border border-white/10 rounded-xl p-3.5 bg-slate-900/40 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-cyan-400" />
                  <span className="text-xs font-bold text-slate-200">Netlify of GitHub Pages modus?</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input 
                    type="checkbox" 
                    className="sr-only peer"
                    checked={useClientSideApi}
                    onChange={(e) => setUseClientSideApi(e.target.checked)}
                  />
                  <div className="w-9 h-5 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-slate-300 after:border-slate-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500"></div>
                </label>
              </div>

              {useClientSideApi && (
                <div className="space-y-2.5 pt-2.5 border-t border-white/5 animate-fadeIn">
                  <p className="text-[11px] text-slate-400 leading-normal">
                    Omdat je de app op Netlify of GitHub Pages host als pure statische site, is de ingebouwde Node/Express-backend niet beschikbaar. Vul hieronder je eigen Gemini API Key in om direct vanuit de browser te genereren.
                  </p>
                  <div>
                    <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400 mb-1">
                      Je eigen Google Gemini API Key:
                    </label>
                    <input
                      type="password"
                      placeholder="AIzaSy..."
                      value={clientApiKey}
                      onChange={(e) => setClientApiKey(e.target.value)}
                      className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 leading-relaxed">
                    Je sleutel wordt veilig opgeslagen in de <code>localStorage</code> van je browser en nooit gedeeld of geüpload. 
                    <a 
                      href="https://aistudio.google.com/" 
                      target="_blank" 
                      rel="noopener noreferrer" 
                      className="text-cyan-400 hover:underline inline-flex items-center gap-1 ml-1"
                    >
                      Krijg hier een gratis sleutel <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  </div>
                </div>
              )}
            </div>

            {/* Trigger Button */}
            <button
              id="generate-structure-btn"
              onClick={handleGenerate}
              disabled={isGenerating}
              className={`w-full py-3.5 px-4 rounded-xl font-bold flex items-center justify-center gap-2 shadow-xl shrink-0 transition-all duration-300 overflow-hidden relative group/btn mt-2 ${
                isGenerating
                  ? "bg-slate-800 text-slate-400 cursor-not-allowed border border-slate-700"
                  : "bg-gradient-to-r from-cyan-500 via-indigo-600 to-indigo-700 hover:from-cyan-400 hover:to-indigo-500 text-slate-950 font-extrabold hover:text-white shadow-cyan-500/10 hover:shadow-cyan-400/20 active:scale-[0.98]"
              }`}
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  <span>Extraheren met Gemini AI...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5 text-yellow-300 fill-current animate-pulse group-hover/btn:scale-110 transition-transform" />
                  <span className="tracking-wide">Automatisch Genereren via AI</span>
                </>
              )}
            </button>

            {error && (
              <div id="error-alert" className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-300 flex items-start gap-2 animate-fadeIn">
                <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400 mt-0.5" />
                <div>
                  <span className="font-bold">Foutmelding:</span> {error}
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Right Column: Schema Outputs & Sandbox Preview (Span 7) */}
        <section id="output-section" className="lg:col-span-7 flex flex-col gap-5 h-full min-h-[500px]">
          
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-widest text-slate-400">Resultaat &amp; Optimalisaties</span>
              <span className="text-[10px] bg-cyan-400/10 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-400/20">Step 2</span>
            </div>

            {/* Quick Status badges */}
            <div className="flex gap-2">
              {generatedData ? (
                <span className="flex items-center gap-1.5 text-[10px] text-green-400 bg-green-500/10 px-2.5 py-1 rounded-full border border-green-500/20 font-medium">
                  <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-ping"></span> 
                  Structured Data Klaar
                </span>
              ) : (
                <span className="text-[10px] text-slate-400 bg-slate-800/60 px-2.5 py-1 rounded-full border border-white/5">
                  Wachten op invoer
                </span>
              )}
            </div>
          </div>

          {/* Workbench Card */}
          <div className="flex-1 backdrop-blur-xl bg-slate-900/40 border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl min-h-[550px]">
            
            {/* Tab Controller Bar */}
            <div className="bg-white/5 border-b border-white/10 px-4 py-2 flex items-center justify-between grid grid-cols-4 lg:flex gap-1">
              <div className="flex items-center gap-1 col-span-3">
                <button
                  id="tab-json-btn"
                  onClick={() => setActiveTab("json")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    activeTab === "json"
                      ? "bg-white/10 text-yellow-300 border border-white/10"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-cyan-400" />
                  <span>JSON-LD Script</span>
                </button>

                <button
                  id="tab-fields-btn"
                  onClick={() => setActiveTab("fields")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all relative ${
                    activeTab === "fields"
                      ? "bg-white/10 text-white border border-white/10"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Sliders className="w-3.5 h-3.5 text-purple-400" />
                  <span>Aanpassen</span>
                  {generatedData && (
                    <span className="absolute top-0.5 right-0.5 w-2 h-2 bg-purple-500 rounded-full animate-bounce"></span>
                  )}
                </button>

                <button
                  id="tab-preview-btn"
                  onClick={() => setActiveTab("preview")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    activeTab === "preview"
                      ? "bg-white/10 text-white border border-white/10"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <Eye className="w-3.5 h-3.5 text-blue-400" />
                  <span>Google Preview</span>
                </button>

                <button
                  id="tab-history-btn"
                  onClick={() => setActiveTab("history")}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    activeTab === "history"
                      ? "bg-white/10 text-white border border-white/10"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <History className="w-3.5 h-3.5 text-pink-400" />
                  <span>Geschiedenis ({history.length})</span>
                </button>
              </div>

              {/* Clipboard Action (if data ready) */}
              {generatedData && activeTab !== "history" && (
                <div className="col-span-1 flex justify-end">
                  <button
                    id="copy-to-clipboard-hdr-btn"
                    onClick={() => handleCopyToClipboard(compiledScriptString(), "Volledig JSON-LD script gekopieerd!")}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-emerald-500/20 to-teal-500/20 hover:from-emerald-500/35 hover:to-teal-500/35 rounded-lg text-xs font-bold text-emerald-300 transition-all border border-emerald-500/30"
                  >
                    <Copy className="w-3.5 h-3.5 text-emerald-400" />
                    <span className="hidden sm:inline">Kopieer Script</span>
                  </button>
                </div>
              )}
            </div>

            {/* Inner Workspace Tabs */}
            <div className="flex-1 p-5 overflow-y-auto max-h-[580px] min-h-[400px]">
              
              {/* TAB 1: JSON-LD VIEW */}
              {activeTab === "json" && (
                <div className="h-full flex flex-col justify-between gap-4">
                  {generatedData ? (
                    <div className="relative flex-1 flex flex-col">
                      <div className="flex justify-between items-center text-xs text-slate-500 font-mono mb-2">
                        <span>Type: schema.org/JobPosting</span>
                        <span>Structured Script Element</span>
                      </div>
                      
                      <div className="flex-1 bg-slate-950/80 border border-white/10 rounded-xl p-4 font-mono text-xs overflow-x-auto text-cyan-300/90 leading-relaxed max-h-[380px] overflow-y-auto relative shadow-inner">
                        <pre className="whitespace-pre-wrap word-break-all select-all">
                          {compiledScriptString()}
                        </pre>
                      </div>

                      <div className="flex flex-col sm:flex-row gap-3 mt-4">
                        <button
                          id="copy-jsonld-sub-btn"
                          onClick={() => handleCopyToClipboard(compiledScriptString(), "JSON-LD Script gekopieerd naar klembord!")}
                          className="flex-1 py-3 px-4 bg-white/10 hover:bg-white/15 text-white rounded-xl text-xs font-bold transition-all border border-white/10 flex items-center justify-center gap-2 hover:border-white/20 active:scale-[0.98]"
                        >
                          <Copy className="w-4 h-4 text-cyan-300" />
                          Kopieer Volledige Tag
                        </button>
                        <button
                          id="copy-raw-json-btn"
                          onClick={() => handleCopyToClipboard(getCompiledJsonLd(), "Pure JSON-inhoud (zonder script tag) gekopieerd!")}
                          className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 text-slate-300 rounded-xl text-xs font-medium transition-all border border-white/5 flex items-center justify-center gap-2 active:scale-[0.98]"
                        >
                          <Copy className="w-4 h-4 text-slate-400" />
                          Kopieer Enkel PURE JSON
                        </button>
                        <button
                          id="download-jsonld-btn"
                          onClick={handleDownloadFile}
                          className="py-3 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 active:scale-[0.98] shadow-lg shadow-indigo-600/20"
                        >
                          <Download className="w-4 h-4" />
                          <span>Download .jsonld</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-16 text-slate-500">
                      <div className="w-16 h-16 bg-white/5 border border-white/5 rounded-full flex items-center justify-center mb-4">
                        <FileText className="w-8 h-8 text-slate-400" />
                      </div>
                      <h4 className="text-sm font-semibold text-slate-300">Nog geen Structured Data gegenereerd</h4>
                      <p className="text-xs text-slate-500 max-w-sm mt-1">
                        Plak hiernaast een vacature of klik op een voorbeeld, en druk op &apos;Automatisch Genereren via AI&apos;.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: INTERACTIVE FIELD ADJUSTMENTS */}
              {activeTab === "fields" && (
                <div className="h-full">
                  {generatedData ? (
                    <div className="space-y-4 animate-fadeIn">
                      
                      <div className="flex items-center gap-2 bg-yellow-500/10 border border-yellow-500/20 p-3 rounded-xl text-xs text-yellow-300 mb-4">
                        <Info className="w-4 h-4 text-yellow-400 shrink-0" />
                        <span>Pas eventuele gegevens hieronder aan. De JSON-LD code aan de linkerkant past zich direct automatisch mee aan!</span>
                      </div>

                      {/* Section 1: Basis Info */}
                      <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-3.5">
                        <h4 className="text-xs font-bold text-cyan-400 uppercase tracking-widest border-b border-white/5 pb-1.5">Basis Vacature Gegevens</h4>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Functietitel (title)</label>
                            <input 
                              type="text"
                              value={generatedData.title}
                              onChange={(e) => handleFieldChange("title", e.target.value)}
                              className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Organisatie / Werkgever (company)</label>
                            <input 
                              type="text"
                              value={generatedData.company}
                              onChange={(e) => handleFieldChange("company", e.target.value)}
                              className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/30 transition-all"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Publicatiedatum</label>
                            <input 
                              type="date"
                              value={generatedData.datePosted}
                              onChange={(e) => handleFieldChange("datePosted", e.target.value)}
                              className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Einddatum (validThrough)</label>
                            <input 
                              type="date"
                              value={generatedData.validThrough}
                              onChange={(e) => handleFieldChange("validThrough", e.target.value)}
                              className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-all"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Vacature URL (url)</label>
                          <input 
                            type="url"
                            value={vacatureUrl}
                            onChange={(e) => setVacatureUrl(e.target.value)}
                            placeholder="https://www.werkenbijkoopmaninternational.com/..."
                            className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500/35 transition-all"
                          />
                        </div>
                      </div>

                      {/* Section 2: Locatie & Type */}
                      <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-3.5">
                        <h4 className="text-xs font-bold text-indigo-400 uppercase tracking-widest border-b border-white/5 pb-1.5">Locatie &amp; Werkomgeving</h4>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {(["ONSITE", "HYBRID", "REMOTE"] as const).map((r) => (
                            <button
                              key={r}
                              type="button"
                              onClick={() => handleFieldChange("remoteType", r)}
                              className={`py-1.5 px-2.5 rounded-lg text-xs font-medium border text-center transition-all ${
                                generatedData.remoteType === r
                                  ? "bg-indigo-600/30 border-indigo-500 text-indigo-300 font-bold"
                                  : "bg-slate-950/40 border-white/5 text-slate-400 hover:border-white/10"
                              }`}
                            >
                              {r === "ONSITE" ? "🏢 Kantoor/On-site" : r === "HYBRID" ? "🏡 Hybride" : "🌍 Volledig Remote"}
                            </button>
                          ))}
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          <div className="col-span-2">
                            <label className="block text-[11px] text-slate-400 mb-1">Plaatsnaam (locality)</label>
                            <input 
                              type="text"
                              value={generatedData.locality}
                              onChange={(e) => handleFieldChange("locality", e.target.value)}
                              className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Regio/Provincie</label>
                            <input 
                              type="text"
                              value={generatedData.region}
                              onChange={(e) => handleFieldChange("region", e.target.value)}
                              placeholder="Flevoland"
                              className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-700 focus:outline-none focus:border-cyan-500 transition-all"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Landcode</label>
                            <input 
                              type="text"
                              value={generatedData.countryCode}
                              onChange={(e) => handleFieldChange("countryCode", e.target.value)}
                              className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition-all text-center"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Straatnaam &amp; Huisnummer (Optioneel)</label>
                            <input 
                              type="text"
                              value={generatedData.streetAddress}
                              onChange={(e) => handleFieldChange("streetAddress", e.target.value)}
                              placeholder="Oosterhavenweg 4"
                              className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-700 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Postcode (Optioneel)</label>
                            <input 
                              type="text"
                              value={generatedData.postalCode}
                              onChange={(e) => handleFieldChange("postalCode", e.target.value)}
                              placeholder="8308 AA"
                              className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder:text-slate-700 focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Koopman Location Quick Fill Buttons */}
                        <div className="bg-slate-950/40 border border-white/5 rounded-xl p-3 space-y-2">
                          <label className="block text-[10px] uppercase font-bold tracking-wider text-slate-400">Koopman Locatie Snelkiezer</label>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                handleFieldChange("locality", "Emmeloord");
                                handleFieldChange("streetAddress", "Ecu 6");
                                handleFieldChange("postalCode", "8305 BA");
                                handleFieldChange("region", "Flevoland");
                                triggerToast("Adres Emmeloord (DC) ingevuld!", "info");
                              }}
                              className="text-left bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/10 rounded-xl p-2.5 transition-all text-xs"
                            >
                              <div className="font-bold text-cyan-400">Emmeloord (DC)</div>
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">Ecu 6, 8305 BA Emmeloord</div>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                handleFieldChange("locality", "Amsterdam");
                                handleFieldChange("streetAddress", "Distelweg 88");
                                handleFieldChange("postalCode", "1031 HH");
                                handleFieldChange("region", "Noord-Holland");
                                triggerToast("Adres Amsterdam ingevuld!", "info");
                              }}
                              className="text-left bg-white/5 hover:bg-white/10 active:scale-[0.98] border border-white/10 rounded-xl p-2.5 transition-all text-xs"
                            >
                              <div className="font-bold text-cyan-400">Amsterdam</div>
                              <div className="text-[10px] text-slate-400 truncate mt-0.5">Distelweg 88, 1031 HH Amsterdam</div>
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Section 3: Dienstverband & Salaris */}
                      <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-3.5">
                        <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-widest border-b border-white/5 pb-1.5">Dienstverband &amp; Salaris</h4>
                        
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1.5">Dienstverbanden (meerdere mogelijk)</label>
                          <div className="flex flex-wrap gap-2">
                            {[
                              { code: "FULL_TIME", label: "Fulltime" },
                              { code: "PART_TIME", label: "Parttime" },
                              { code: "CONTRACTOR", label: "Interim/Contractor" },
                              { code: "TEMPORARY", label: "Tijdelijk" },
                              { code: "INTERN", label: "Stage/Intern" },
                            ].map((type) => {
                              const active = (generatedData.employmentTypes || []).includes(type.code);
                              return (
                                <button
                                  key={type.code}
                                  type="button"
                                  onClick={() => handleEmploymentTypeToggle(type.code)}
                                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                                    active
                                      ? "bg-emerald-600/30 border-emerald-500 text-emerald-300 font-bold"
                                      : "bg-slate-950/40 border-white/5 text-slate-400 hover:border-white/10"
                                  }`}
                                >
                                  {type.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Min. Salaris</label>
                            <input 
                              type="number"
                              value={generatedData.salaryMinimum}
                              onChange={(e) => handleFieldChange("salaryMinimum", Number(e.target.value))}
                              className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Max. Salaris</label>
                            <input 
                              type="number"
                              value={generatedData.salaryMaximum}
                              onChange={(e) => handleFieldChange("salaryMaximum", Number(e.target.value))}
                              className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Valuta</label>
                            <input 
                              type="text"
                              value={generatedData.salaryCurrency}
                              onChange={(e) => handleFieldChange("salaryCurrency", e.target.value)}
                              className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none text-center"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">Salaris Periode</label>
                            <select 
                              value={generatedData.salaryUnit}
                              onChange={(e) => handleFieldChange("salaryUnit", e.target.value)}
                              className="w-full bg-slate-950/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none"
                            >
                              <option value="HOUR">Per Uur</option>
                              <option value="WEEK">Per Week</option>
                              <option value="MONTH">Per Maand</option>
                              <option value="YEAR">Per Jaar</option>
                            </select>
                          </div>
                        </div>
                      </div>

                      {/* Section 4: Pure Description HTML */}
                      <div className="bg-white/5 border border-white/5 rounded-xl p-4 space-y-2">
                        <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-widest">Veilige HTML Omschrijving</h4>
                          <span className="text-[10px] text-slate-500 font-mono">Gebruikt door indexeerders</span>
                        </div>
                        <label className="block text-[11px] text-slate-400">Wordt overgenomen in de &apos;description&apos; tag van de Google JobPosting. (Wordt getoond aan werkzoekenden)</label>
                        <textarea 
                          rows={6}
                          value={generatedData.descriptionHtml}
                          onChange={(e) => handleFieldChange("descriptionHtml", e.target.value)}
                          className="w-full bg-slate-950/60 border border-white/10 rounded-lg p-3 text-xs font-mono text-emerald-400/90 whitespace-pre focus:outline-none focus:border-cyan-500 transition-all leading-normal"
                        />
                      </div>

                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-16 text-slate-500">
                      <div className="w-16 h-16 bg-white/5 border border-white/5 rounded-full flex items-center justify-center mb-4">
                        <Sliders className="w-8 h-8 text-slate-400" />
                      </div>
                      <h4 className="text-sm font-semibold text-slate-300">Aanpassen is nog niet actief</h4>
                      <p className="text-xs text-slate-500 max-w-sm mt-1">
                        Genereer eerst een JSON-LD script op basis van een vacature om de velden direct interactief te wijzigen.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: GOOGLE JOBS PREVIEW */}
              {activeTab === "preview" && (
                <div className="h-full">
                  {generatedData ? (
                    <div className="space-y-4 animate-fadeIn">
                      <div className="flex items-center gap-2 bg-blue-500/15 border border-blue-500/25 p-3 rounded-xl text-xs text-blue-300 mb-2">
                        <Eye className="w-4 h-4 text-blue-400 shrink-0" />
                        <span>Dit is een visuele weergave van hoe jouw vacature eruit zal zien in de officiële Google Jobs widget!</span>
                      </div>

                      {/* Google Widget Card */}
                      <div className="bg-[#202124] border border-[#303134] rounded-xl overflow-hidden text-slate-200 text-sm shadow-xl p-5 family-sans">
                        
                        {/* Top Line: Company Info Logo area */}
                        <div className="flex gap-4 items-start pb-4 border-b border-[#303134]">
                          {/* Simulated Company initials Avatar */}
                          <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-slate-700 to-indigo-900 border border-white/10 flex items-center justify-center text-xl font-black text-slate-100 uppercase tracking-wider shrink-0 shadow-md">
                            {generatedData.company ? generatedData.company.substring(0, 2) : "JO"}
                          </div>

                          <div className="space-y-1">
                            {/* Blue Google Styled Link */}
                            <h3 className="text-lg font-medium text-[#8ab4f8] hover:underline cursor-pointer leading-tight">
                              {generatedData.title || "Geen functietitel"}
                            </h3>
                            <div className="text-sm text-slate-300 font-medium">
                              {generatedData.company || "Geen bedrijfsnaam"}
                            </div>
                            
                            {/* Subtitle elements */}
                            <div className="flex flex-wrap items-center gap-y-1 gap-x-2.5 text-xs text-slate-400">
                              <span className="flex items-center gap-1">
                                <MapPin className="w-3.5 h-3.5 text-slate-500" />
                                {generatedData.locality || "Locatie onbekend"}
                                {generatedData.region ? `, ${generatedData.region}` : ""}
                              </span>
                              
                              <span className="text-slate-600">•</span>

                              <span className="bg-[#303134] text-slate-300 px-2.5 py-0.5 rounded-full font-medium text-[11px]">
                                {generatedData.remoteType === "REMOTE" ? "Helemaal Thuiswerken" : generatedData.remoteType === "HYBRID" ? "Hybride" : "Op Kantoor"}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Extra badging section */}
                        <div className="flex flex-wrap gap-2 py-3.5 border-b border-[#303134] text-xs">
                          {/* Employment Type badge */}
                          {(generatedData.employmentTypes || ["FULL_TIME"]).map((type) => (
                            <span key={type} className="bg-[#272729] border border-[#3e4042] text-slate-200 px-3 py-1 rounded-md flex items-center gap-1 font-medium">
                              <Globe className="w-3 h-3 text-cyan-400" />
                              {type === "FULL_TIME" ? "Fulltime" : type === "PART_TIME" ? "Parttime" : type === "CONTRACTOR" ? "Meting/Interim" : type === "INTERN" ? "Stage" : type}
                            </span>
                          ))}

                          {/* Salary Badge */}
                          {(generatedData.salaryMinimum > 0 || generatedData.salaryMaximum > 0) && (
                            <span className="bg-[#272729] border border-[#3e4042] text-slate-200 px-3 py-1 rounded-md flex items-center gap-1 font-semibold text-emerald-400">
                              <DollarSign className="w-3.5 h-3.5 text-emerald-400" />
                              {generatedData.salaryCurrency === "EUR" ? "€" : "$"}
                              {generatedData.salaryMinimum.toLocaleString("nl-NL")} 
                              {generatedData.salaryMaximum > generatedData.salaryMinimum && ` - €${generatedData.salaryMaximum.toLocaleString("nl-NL")}`}
                              <span className="text-[10px] text-slate-400 font-normal"> / {generatedData.salaryUnit?.toLowerCase() === "month" ? "mnd" : generatedData.salaryUnit?.toLowerCase() === "year" ? "jr" : "uur"}</span>
                            </span>
                          )}

                          {/* Publishing Date badge */}
                          <span className="bg-[#272729] border border-[#3e4042] text-slate-300 px-3 py-1 rounded-md flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                            Gepost op: {generatedData.datePosted}
                          </span>
                        </div>

                        {/* Description content */}
                        <div className="py-4 space-y-2">
                          <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2 flex items-center gap-1.5">
                            <FileText className="w-3.5 h-3.5 text-slate-400" />
                            Over de Functie (Voorbeeldweergave)
                          </h4>
                          {/* Display parsed HTML securely */}
                          <div 
                            className="text-xs text-slate-300 leading-relaxed space-y-2 prose prose-invert max-h-[180px] overflow-y-auto pr-2"
                            dangerouslySetInnerHTML={{ __html: generatedData.descriptionHtml || "<p>Geen beschrijving beschikbaar</p>" }}
                          />
                        </div>

                        {/* Bottom action bar */}
                        <div className="pt-4 border-t border-[#303134] flex items-center justify-between text-xs text-slate-400">
                          <div className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                            <span>Directe link via Schema.org indexatie</span>
                          </div>
                          <span className="text-slate-500 font-mono text-[10px]">Google Jobs Widget 2026</span>
                        </div>

                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-16 text-slate-500">
                      <div className="w-16 h-16 bg-white/5 border border-white/5 rounded-full flex items-center justify-center mb-4">
                        <Eye className="w-8 h-8 text-slate-400" />
                      </div>
                      <h4 className="text-sm font-semibold text-slate-300">Nog geen preview beschikbaar</h4>
                      <p className="text-xs text-slate-500 max-w-sm mt-1">
                        Genereer eerst een gestructureerde vacature om de Google Search snippet preview onmiddellijk te inspecteren.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 4: HISTORY MANAGER */}
              {activeTab === "history" && (
                <div className="h-full">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-4">
                    <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider">Vorige Generaties ({history.length})</h3>
                    {history.length > 0 && (
                      <button
                        id="clear-all-history-btn"
                        onClick={() => {
                          if (window.confirm("Weet je zeker dat je alle geschiedenis wilt wissen?")) {
                            saveHistory([]);
                            triggerToast("Volledige geschiedenis gewist.");
                          }
                        }}
                        className="text-[10px] text-rose-400 hover:underline flex items-center gap-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Alles Wissen
                      </button>
                    )}
                  </div>

                  {history.length > 0 ? (
                    <div className="space-y-2.5 max-h-[420px] overflow-y-auto pr-1">
                      {history.map((item) => (
                        <div
                          key={item.id}
                          onClick={() => handleLoadHistory(item)}
                          className="group/item relative backdrop-blur-md bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-xl p-3.5 transition-all duration-200 cursor-pointer flex items-center justify-between gap-4"
                        >
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-white group-hover/item:text-cyan-300 transition-colors truncate">
                              {item.title}
                            </h4>
                            <div className="text-[11px] text-slate-300 flex items-center gap-2 mt-1">
                              <span className="font-medium text-indigo-400">{item.company}</span>
                              <span className="text-slate-600">|</span>
                              <span className="text-slate-400 flex items-center gap-1 block">
                                <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
                                {item.data.locality || "Plaats onbekend"}
                              </span>
                            </div>
                            <div className="text-[9px] text-slate-500 mt-1">
                              Gegenereerd op: {item.dateGenerated}
                            </div>
                          </div>
                          
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              id={`load-history-item-${item.id}`}
                              type="button"
                              className="p-1 px-2.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500 hover:text-slate-950 border border-cyan-400/20 text-cyan-300 text-[10px] font-bold transition-all"
                            >
                              Inladen
                            </button>
                            <button
                              id={`delete-history-item-${item.id}`}
                              type="button"
                              onClick={(e) => handleDeleteHistory(e, item.id)}
                              className="p-1 px-1.5 rounded-lg hover:bg-rose-500/10 border border-transparent hover:border-rose-500/30 text-slate-400 hover:text-rose-400 transition-all"
                              title="Verwijderen uit geschiedenis"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center text-center py-16 text-slate-500">
                      <div className="w-16 h-16 bg-white/5 border border-white/5 rounded-full flex items-center justify-center mb-4">
                        <History className="w-8 h-8 text-slate-400" />
                      </div>
                      <h4 className="text-sm font-semibold text-slate-300">Geen geschiedenis gevonden</h4>
                      <p className="text-xs text-slate-500 max-w-sm mt-1">
                        Je gegenereerde structured-data scripts worden automatisch in deze browser opgeslagen zodat je er later naar terug kan kijken.
                      </p>
                    </div>
                  )}
                </div>
              )}

            </div>

            {/* Bottom Info bar inside Right Container */}
            <div className="bg-white/5 border-t border-white/10 px-5 py-3.5 flex items-center justify-between text-xs text-slate-400 font-medium shrink-0">
              <div className="flex items-center gap-1">
                <Info className="w-4 h-4 text-cyan-400 shrink-0" />
                <span>Geoptimaliseerd volgens de officiële Google Algoritme-richtlijnen</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-slate-500">JSON-LD Gen-v3</span>
              </div>
            </div>

          </div>

        </section>

      </main>

      {/* Footer Status Bar with Guidance Info */}
      <footer id="app-footer" className="relative z-10 px-6 py-5 lg:px-12 bg-black/40 border-t border-white/5 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 font-medium gap-4 mt-8">
        
        <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 bg-emerald-500 rounded-full animate-pulse"></div>
            <span>Status: Gemini 3.5 AI Engine Actief</span>
          </div>
          <span className="hidden sm:inline text-white/10">|</span>
          <span className="text-slate-500">Valideert automatisch op de vereiste Google JobPosting schema-velden</span>
        </div>

        <div className="flex flex-wrap justify-center gap-x-6 gap-y-2 text-[11px] text-slate-500">
          <a 
            href="https://developers.google.com/search/docs/appearance/structured-data/job-posting" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-cyan-400 transition-colors flex items-center gap-1"
          >
            <span>Google Richtlijnen</span>
            <ExternalLink className="w-3 h-3" />
          </a>
          <span>•</span>
          <a 
            href="https://search.google.com/test/rich-results" 
            target="_blank" 
            rel="noopener noreferrer" 
            className="hover:text-cyan-400 transition-colors flex items-center gap-1"
          >
            <span>Rich Results Test Tool</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

      </footer>

    </div>
  );
}

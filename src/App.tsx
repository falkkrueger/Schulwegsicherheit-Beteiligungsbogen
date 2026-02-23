/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/// <reference types="vite/client" />

import React, { useState, useRef, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { 
  MapPin, 
  FileText, 
  Send, 
  Shield, 
  Info, 
  AlertTriangle, 
  Download,
  ExternalLink
} from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

// Fix Leaflet marker icons
// @ts-ignore
import icon from 'leaflet/dist/images/marker-icon.png';
// @ts-ignore
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

let DefaultIcon = L.icon({
    iconUrl: icon,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// --- Types ---
interface Report {
  id: string;
  timestamp: string;
  source: 'Digital' | 'Analog';
  coordinates: [number, number];
  locationName: string;
  category: 'Gefahr' | 'Sicher';
  description: string;
  imageUrl?: string;
  confidenceScore: number;
}

// --- Components ---

const LocationMarker = ({ position, setPosition }: { position: [number, number] | null, setPosition: (pos: [number, number]) => void }) => {
  useMapEvents({
    click(e) {
      setPosition([e.latlng.lat, e.latlng.lng]);
    },
  });

  return position === null ? null : (
    <Marker position={position} />
  );
};

const MapUpdater = ({ center }: { center: [number, number] }) => {
  const map = useMap();
  useEffect(() => {
    map.setView(center, 15);
  }, [center, map]);
  return null;
};

export default function App() {
  const [position, setPosition] = useState<[number, number] | null>(null);
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<'Gefahr' | 'Sicher'>('Gefahr');
  const [isProcessing, setIsProcessing] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  // Default center: Kirchlengern
  const defaultCenter: [number, number] = [52.2012, 8.6350];

  const handleAddMarker = (e: React.FormEvent) => {
    e.preventDefault();
    if (!position) return;

    const newReport: Report = {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: new Date().toISOString(),
      source: 'Digital',
      coordinates: position,
      locationName: 'Manuelle Auswahl',
      category,
      description,
      confidenceScore: 1.0
    };

    setReports([newReport, ...reports]);
    
    // Reset form
    setPosition(null);
    setDescription('');
  };

  const exportPDF = async () => {
    if (!mapRef.current) return;
    
    setIsProcessing(true);
    try {
      const element = mapRef.current;
      if (!element) return;

      // --- SNAPSHOT MODE (3:2 Ratio) ---
      const originalWidth = element.style.width;
      const originalHeight = element.style.height;
      const originalPosition = element.style.position;

      // Force a stable 3:2 size for the capture
      const captureWidth = 1200;
      const captureHeight = 800;
      
      element.style.width = `${captureWidth}px`;
      element.style.height = `${captureHeight}px`; 
      element.style.position = 'fixed';
      element.style.top = '-10000px'; 
      element.style.left = '-10000px';

      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }

      window.dispatchEvent(new Event('resize'));
      await new Promise(resolve => setTimeout(resolve, 1000));

      const canvas = await html2canvas(element, {
        useCORS: true,
        allowTaint: false,
        backgroundColor: '#ffffff',
        scale: 2,
        logging: false,
        width: captureWidth,
        height: captureHeight,
        onclone: (clonedDoc) => {
          const clonedMap = clonedDoc.querySelector('.leaflet-container') as HTMLElement;
          if (clonedMap) {
            clonedMap.style.width = `${captureWidth}px`;
            clonedMap.style.height = `${captureHeight}px`;
          }
        }
      });
      
      element.style.width = originalWidth;
      element.style.height = originalHeight;
      element.style.position = originalPosition;
      element.style.top = '';
      element.style.left = '';
      
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize();
      }
      window.dispatchEvent(new Event('resize'));

      const imgData = canvas.toDataURL('image/jpeg', 0.95);
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      
      // --- DYNAMIC ASPECT RATIO CALCULATION ---
      // We use the actual dimensions of the captured canvas to determine the height in the PDF.
      // This ensures that even if the capture size wasn't exactly what we requested,
      // the image will not be stretched in the PDF.
      const canvasWidth = canvas.width;
      const canvasHeight = canvas.height;
      const aspectRatio = canvasWidth / canvasHeight;
      
      const pdfWidth = 170;
      const pdfHeight = pdfWidth / aspectRatio;
      const xOffset = 20;
      
      // --- Header & Branding ---
      pdf.setFillColor(220, 38, 38); 
      pdf.rect(0, 0, pageWidth, 45, 'F');
      
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(22);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Schulwegsicherheit Kirchlengern', 20, 28);
      
      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Beteiligungsbogen | Erstellt am: ${new Date().toLocaleDateString('de-DE')}`, 20, 38);
      
      // --- Map Image ---
      // Draw a clean frame
      pdf.setDrawColor(200, 200, 200);
      pdf.setLineWidth(0.1);
      pdf.rect(xOffset - 0.5, 59.5, pdfWidth + 1, pdfHeight + 1);
      
      // Add the image
      pdf.addImage(imgData, 'JPEG', xOffset, 60, pdfWidth, pdfHeight);
      
      pdf.setTextColor(100, 116, 139);
      pdf.setFontSize(7);
      pdf.text('Kartenausschnitt mit Ihren Markierungen', xOffset, 60 + pdfHeight + 4);

      // --- Blank Form Section ---
      const formStartY = 60 + pdfHeight + 15;
      pdf.setFontSize(13);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(15, 23, 42);
      pdf.text('Ihre Anmerkungen zum Schulweg', 20, formStartY);

      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(71, 85, 105);
      const instructionText = 'Bitte beschreiben Sie hier die markierten Stellen. Warum fühlen Sie sich dort (un)sicher? Welche konkreten Verbesserungen schlagen Sie vor?';
      const splitInstructions = pdf.splitTextToSize(instructionText, 170);
      pdf.text(splitInstructions, 20, formStartY + 7);

      pdf.setFontSize(10);
      pdf.setFont('helvetica', 'bold');
      pdf.setTextColor(15, 23, 42);
      const labelY = formStartY + 12 + (splitInstructions.length * 4);
      pdf.text('Beschreibung / Begründung:', 20, labelY);
      
      // Draw a clean box for handwriting
      const boxBottom = 275;
      const boxHeight = boxBottom - (labelY + 3);
      pdf.setDrawColor(226, 232, 240);
      pdf.rect(20, labelY + 3, 170, boxHeight); 
      
      // Add writing lines
      pdf.setDrawColor(241, 245, 249);
      for (let l = labelY + 13; l < (labelY + 3 + boxHeight - 5); l += 8) {
        pdf.line(25, l, 185, l);
      }

      // --- Footer ---
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text('SPD Kirchlengern - Gemeinsam für Sicherheit', pageWidth / 2, 287, { align: 'center' });

      // --- Reports Section (If any exist) ---
      if (reports.length > 0) {
        pdf.addPage();
        let yPos = 20;
        pdf.setFontSize(12);
        pdf.setFont('helvetica', 'bold');
        pdf.setTextColor(15, 23, 42);
        pdf.text('Bereits erfasste Meldungen', 20, yPos);
        yPos += 10;

        reports.forEach((r, i) => {
          if (yPos > 260) {
            pdf.addPage();
            yPos = 20;
          }
          
          pdf.setDrawColor(241, 245, 249); // slate-100
          pdf.line(20, yPos, 190, yPos);
          yPos += 5;
          
          pdf.setFontSize(10);
          pdf.setFont('helvetica', 'bold');
          const categoryColor = r.category === 'Gefahr' ? [185, 28, 28] : [4, 120, 87];
          pdf.setTextColor(categoryColor[0], categoryColor[1], categoryColor[2]);
          pdf.text(`${i + 1}. ${r.category.toUpperCase()}`, 20, yPos);
          
          pdf.setTextColor(51, 65, 85);
          pdf.setFont('helvetica', 'normal');
          pdf.setFontSize(9);
          pdf.text(`Ort: ${r.locationName}`, 60, yPos);
          pdf.text(`Quelle: ${r.source}`, 150, yPos);
          
          yPos += 7;
          
          pdf.setFontSize(9);
          const splitDesc = pdf.splitTextToSize(`Beschreibung: ${r.description}`, 170);
          pdf.text(splitDesc, 20, yPos);
          yPos += (splitDesc.length * 5) + 5;
        });
      }
      
      // --- Footer ---
      const pageCount = pdf.internal.pages.length - 1;
      for (let i = 1; i <= pageCount; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(148, 163, 184);
        pdf.text(`SPD Kirchlengern - Gemeinsam für Sicherheit`, pageWidth / 2, 285, { align: 'center' });
      }
      
      pdf.save(`Schulwegsicherheit_Kirchlengern_${new Date().getTime()}.pdf`);
      alert('PDF wurde erfolgreich generiert.');
    } catch (error) {
      console.error("PDF Export Error:", error);
      alert('Fehler beim PDF-Export. Bitte stellen Sie sicher, dass alle Karten-Kacheln geladen sind.');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-red-600 p-2 rounded-lg">
              <Shield className="text-white w-6 h-6" />
            </div>
            <div>
              <h1 className="font-bold text-slate-900 leading-none">Schulwegsicherheit</h1>
              <p className="text-xs text-slate-500 mt-1">Gemeinde Kirchlengern</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <button 
              onClick={exportPDF}
              disabled={isProcessing}
              className="flex items-center gap-2 bg-red-600 text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-red-700 transition-all shadow-lg shadow-red-100 disabled:opacity-50"
            >
              {isProcessing ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              PDF Beteiligungsbogen generieren
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-7xl mx-auto w-full p-4 md:p-6 grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* Left Column: Map */}
        <div className="md:col-span-7 lg:col-span-8 flex flex-col gap-6">
          <div ref={mapRef} className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden relative aspect-[3/2] w-full shadow-lg">
            <div className="absolute inset-0">
              <MapContainer 
                center={defaultCenter} 
                zoom={15} 
                scrollWheelZoom={true}
                ref={mapInstanceRef}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <LocationMarker position={position} setPosition={setPosition} />
                {reports.map(report => (
                  <Marker 
                    key={report.id} 
                    position={report.coordinates}
                    icon={L.divIcon({
                      className: 'custom-div-icon',
                      html: `<div style="background-color: ${report.category === 'Gefahr' ? '#ef4444' : '#10b981'}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 2px 4px rgba(0,0,0,0.2);"></div>`,
                      iconSize: [12, 12],
                      iconAnchor: [6, 6]
                    })}
                  />
                ))}
              </MapContainer>
            </div>
            <div className="absolute bottom-4 left-4 z-[1000] flex flex-col gap-2">
              <div className="bg-white/90 backdrop-blur p-3 rounded-2xl border border-slate-200 shadow-lg max-w-xs">
                <div className="flex items-start gap-2">
                  <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-slate-600">
                    Klicken Sie auf die Karte, um Markierungen für die PDF-Erstellung zu setzen.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Marker Management */}
        <div className="md:col-span-5 lg:col-span-4 flex flex-col gap-6">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center gap-2">
              <MapPin className="w-5 h-5 text-red-600" />
              Markierung hinzufügen
            </h3>
            
            <form onSubmit={handleAddMarker} className="space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl">
                <p className="text-[10px] text-blue-700 leading-tight">
                  Wählen Sie einen Punkt auf der Karte aus, um ihn in die PDF-Liste der "Bereits erfassten Meldungen" aufzunehmen.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Standort</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm text-slate-600 flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-slate-400" />
                  {position ? `${position[0].toFixed(4)}, ${position[1].toFixed(4)}` : 'Bitte auf Karte wählen'}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Kategorie</label>
                <div className="grid grid-cols-2 gap-2">
                  <button 
                    type="button"
                    onClick={() => setCategory('Gefahr')}
                    className={`py-2 rounded-xl text-sm font-medium border transition-all ${category === 'Gefahr' ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    Gefahrenstelle
                  </button>
                  <button 
                    type="button"
                    onClick={() => setCategory('Sicher')}
                    className={`py-2 rounded-xl text-sm font-medium border transition-all ${category === 'Sicher' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-slate-200 text-slate-500'}`}
                  >
                    Sicherer Weg
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Beschreibung (für PDF)</label>
                <textarea 
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Warum ist dieser Ort wichtig?"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl p-3 text-sm focus:ring-2 focus:ring-red-500 outline-none min-h-[80px]"
                />
              </div>

              <button 
                type="submit"
                disabled={!position}
                className={`w-full py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2 ${!position ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-900 text-white hover:bg-slate-800 shadow-lg shadow-slate-100'}`}
              >
                <Send className="w-4 h-4" />
                Zur PDF-Liste hinzufügen
              </button>
            </form>
          </div>

          {/* Markers List */}
          <div className="bg-white rounded-3xl border border-slate-200 shadow-sm p-6 flex-1 overflow-hidden flex flex-col">
            <h3 className="font-bold text-slate-900 mb-4 flex items-center justify-between">
              Markierungen in der PDF
              <span className="bg-slate-100 text-slate-600 text-[10px] px-2 py-1 rounded-full">{reports.length}</span>
            </h3>
            
            <div className="space-y-3 overflow-y-auto flex-1 pr-2">
              {reports.length === 0 ? (
                <div className="text-center py-12">
                  <AlertTriangle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                  <p className="text-sm text-slate-400">Noch keine Markierungen gesetzt.</p>
                </div>
              ) : (
                reports.map(report => (
                  <div 
                    key={report.id}
                    className="p-3 rounded-2xl border border-slate-100 bg-slate-50/50 flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-[10px] font-bold uppercase ${report.category === 'Gefahr' ? 'text-red-600' : 'text-emerald-600'}`}>
                        {report.category}
                      </span>
                      <button 
                        onClick={() => setReports(reports.filter(r => r.id !== report.id))}
                        className="text-slate-400 hover:text-red-500 transition-colors"
                      >
                        Löschen
                      </button>
                    </div>
                    <p className="text-xs text-slate-600 line-clamp-2">{report.description}</p>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-6">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-xs text-slate-400">
            &copy; 2026 Gemeinde Kirchlengern. Entwickelt für die Schulwegsicherheit.
          </p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
              Datenschutz <ExternalLink className="w-3 h-3" />
            </a>
            <a href="#" className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1">
              Impressum <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

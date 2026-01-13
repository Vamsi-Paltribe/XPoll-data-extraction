
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    
    :root {
      --bg-base: #f0f4f9;
      --primary-dark: #2D384A;
      --accent-magenta: #A8328D;
      --accent-coral: #F7A25A;
      --text-main: #2D384A;
      --text-muted: #64748B;
    }

    body { 
      font-family: 'Inter', sans-serif; 
      color: var(--text-main); 
      -webkit-font-smoothing: antialiased;
    }
    
    /* Elegant Scrollbar */
    .custom-scrollbar::-webkit-scrollbar { height: 6px; width: 6px; }
    .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
    .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
    .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94A3B8; }
    
    /* Animations */
    .animate-in { animation-duration: 0.5s; animation-fill-mode: both; animation-timing-function: cubic-bezier(0.16, 1, 0.3, 1); }
    .fade-in { animation-name: fadeIn; }
    .slide-up { animation-name: slideUp; }
    .zoom-in { animation-name: zoomIn; }
    
    @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
    @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
    @keyframes zoomIn { from { transform: scale(0.95); opacity: 0; } to { transform: scale(1); opacity: 1; } }
  `}</style>
);

export default GlobalStyles;

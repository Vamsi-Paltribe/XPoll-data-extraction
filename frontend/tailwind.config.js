/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'system-ui', 'sans-serif'],
            },
            colors: {
                background: '#f8fafc', // Slate-50
                surface: '#ffffff',    // White
                primary: {
                    DEFAULT: '#0f172a', // Slate-900
                    foreground: '#ffffff',
                },
                slate: {
                    100: '#f1f5f9',
                    200: '#e2e8f0',
                    400: '#94a3b8',
                    500: '#64748b',
                    900: '#0f172a',
                },
                accent: {
                    DEFAULT: '#3b82f6', // Subtle Blue for status
                    success: '#22c55e',
                    error: '#ef4444',
                },
                border: '#f1f5f9',    // Slate-100
            },
            boxShadow: {
                'premium': '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -1px rgba(0, 0, 0, 0.03)',
                'card': '0 1px 3px 0 rgba(0, 0, 0, 0.05), 0 1px 2px 0 rgba(0, 0, 0, 0.03)',
                'modal': '0 25px 50px -12px rgba(0, 0, 0, 0.1)',
            },
            borderRadius: {
                'xl': '0.75rem',
                '2xl': '1rem',
                '3xl': '1.5rem',
                '4xl': '2rem',
            }
        },
    },
    plugins: [],
}

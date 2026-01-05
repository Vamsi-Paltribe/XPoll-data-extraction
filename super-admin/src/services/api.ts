import axios, { InternalAxiosRequestConfig } from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:5000/api', // Hardcoded for now, or use env
});

api.interceptors.request.use((config: InternalAxiosRequestConfig) => {
    const token = localStorage.getItem('admin_token') || localStorage.getItem('token');
    if (token) {
        if (config.headers) {
            config.headers.set('x-auth-token', token);
        }
    }
    return config;
});

export default api;

import axios from 'axios';

const api = axios.create({
    baseURL: 'http://localhost:5000/api', // Hardcoded for now, or use env
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('admin_token') || localStorage.getItem('token');
    if (token) {
        config.headers['x-auth-token'] = token;
    }
    return config;
});

export default api;

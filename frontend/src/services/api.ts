import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'https://trade.mayfairmarketing.online';

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config: any) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Intercept 401s to logout user
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const isLoginPage = window.location.pathname === '/login';
    const isAuthMe = error.config?.url?.includes('/auth/me');

    if (error.response?.status === 401 && !isLoginPage && !isAuthMe) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;

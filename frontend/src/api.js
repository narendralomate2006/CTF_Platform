import axios from "axios";

export const API_URL = (
  typeof window !== "undefined" && window.location.hostname && window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000")
);

export const api = axios.create({
  baseURL: API_URL
});

api.interceptors.request.use(
  config => {
    const token = localStorage.getItem("ctf_token");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  error => Promise.reject(error)
);

export function saveToken(token) {
  if (token) {
    localStorage.setItem("ctf_token", token);
  } else {
    localStorage.removeItem("ctf_token");
  }
}

export function getToken() {
  return localStorage.getItem("ctf_token");
}

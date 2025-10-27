import axios from "axios";
import { auth } from "../firebase";
import { API_BASE_URL } from "../config/api";

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
});

axiosInstance.interceptors.request.use(
  async (config) => {
    const user = auth.currentUser;

    if (user) {
      try {
        const token = await user.getIdToken();
        config.headers.Authorization = `Bearer ${token}`;
      } catch (error) {
        console.error("Failed to append auth token to request:", error);
      }
    }

    return config;
  },
  (error) => Promise.reject(error)
);

export default axiosInstance;

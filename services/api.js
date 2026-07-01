import axios from 'axios';
import * as SecureStore from 'expo-secure-store';

const BASE_URL = 'https://al-sahal-tracker-backend.onrender.com';

export const getToken = async () => await SecureStore.getItemAsync('token');
export const saveToken = async (token) => await SecureStore.setItemAsync('token', token);
export const removeToken = async () => await SecureStore.deleteItemAsync('token');

export const signin = async (email, password) => {
  const res = await axios.post(`${BASE_URL}/api/auth/signin`, { email, password });
  return res.data;
};

// Location
export const pingLocation = async (lat, lng) => {
  const token = await getToken();
  await axios.post(`${BASE_URL}/api/location/ping`, { lat, lng }, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const getLatestLocations = async () => {
  const token = await getToken();
  const res = await axios.get(`${BASE_URL}/api/location/latest`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Tracking status
export const updateTrackingStatus = async (is_tracking) => {
  const token = await getToken();
  await axios.post(`${BASE_URL}/api/tracking/status`, { is_tracking }, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const getAllTrackingStatus = async () => {
  const token = await getToken();
  const res = await axios.get(`${BASE_URL}/api/tracking/all`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Visits
export const logVisit = async (visitData) => {
  const token = await getToken();
  const res = await axios.post(`${BASE_URL}/api/visits`, visitData, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

export const getVisits = async (filter, user_id) => {
  const token = await getToken();
  const params = {};
  if (filter) params.filter = filter;
  if (user_id) params.user_id = user_id;
  const res = await axios.get(`${BASE_URL}/api/visits`, {
    headers: { Authorization: `Bearer ${token}` },
    params
  });
  return res.data;
};

// Deliveries
export const logDelivery = async (deliveryData) => {
  const token = await getToken();
  const res = await axios.post(`${BASE_URL}/api/deliveries`, deliveryData, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

export const getDeliveries = async (filter, user_id) => {
  const token = await getToken();
  const params = {};
  if (filter) params.filter = filter;
  if (user_id) params.user_id = user_id;
  const res = await axios.get(`${BASE_URL}/api/deliveries`, {
    headers: { Authorization: `Bearer ${token}` },
    params
  });
  return res.data;
};

export const getNotPaidInvoices = async () => {
  const token = await getToken();
  const res = await axios.get(`${BASE_URL}/api/deliveries/not-paid`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

export const getPaidInvoices = async (filter) => {
  const token = await getToken();
  const params = {};
  if (filter) params.filter = filter;
  const res = await axios.get(`${BASE_URL}/api/deliveries/paid`, {
    headers: { Authorization: `Bearer ${token}` },
    params
  });
  return res.data;
};

export const requestPayment = async (id, payment_method) => {
  const token = await getToken();
  const res = await axios.patch(`${BASE_URL}/api/deliveries/request-payment/${id}`,
    { payment_method },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const approvePayment = async (id) => {
  const token = await getToken();
  const res = await axios.patch(`${BASE_URL}/api/deliveries/approve/${id}`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Admin
export const createSalesman = async (name, email, password) => {
  const token = await getToken();
  const res = await axios.post(`${BASE_URL}/api/admin/create-salesman`,
    { name, email, password },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const getSalesmen = async () => {
  const token = await getToken();
  const res = await axios.get(`${BASE_URL}/api/admin/salesmen`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

export const getNotifications = async () => {
  const token = await getToken();
  const res = await axios.get(`${BASE_URL}/api/admin/notifications`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

export const markNotificationsRead = async () => {
  const token = await getToken();
  await axios.patch(`${BASE_URL}/api/admin/notifications/read`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
};

export const deleteSalesman = async (id) => {
  const token = await getToken();
  const res = await axios.delete(`${BASE_URL}/api/admin/salesmen/${id}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// ADD at the bottom:
export const getSalesmanCredentials = async (id) => {
  const token = await getToken();
  const res = await axios.get(`${BASE_URL}/api/admin/salesmen/${id}/credentials`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Work session history (admin) — point 3
export const getWorkSessions = async (user_id, filter) => {
  const token = await getToken();
  const params = { user_id };
  if (filter) params.filter = filter;
  const res = await axios.get(`${BASE_URL}/api/tracking/sessions`, {
    headers: { Authorization: `Bearer ${token}` }, params
  });
  return res.data;
};

export const getSessionRoute = async (sessionId) => {
  const token = await getToken();
  const res = await axios.get(`${BASE_URL}/api/tracking/route/${sessionId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Salesman summary — point 4 (admin view of today + total counts)
export const getSalesmanSummary = async (id) => {
  const token = await getToken();
  const res = await axios.get(`${BASE_URL}/api/admin/salesmen/${id}/summary`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

// Sales targets — point 5
export const setSalesTarget = async (user_id, month, target_amount) => {
  const token = await getToken();
  const res = await axios.post(`${BASE_URL}/api/admin/sales-target`,
    { user_id, month, target_amount },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const getSalesTarget = async (user_id, month) => {
  const token = await getToken();
  const params = {};
  if (user_id) params.user_id = user_id;
  if (month) params.month = month;
  const res = await axios.get(`${BASE_URL}/api/admin/sales-target`, {
    headers: { Authorization: `Bearer ${token}` }, params
  });
  return res.data;
};

// Sales log — point 6
export const logSale = async (saleData) => {
  const token = await getToken();
  const res = await axios.post(`${BASE_URL}/api/sales`, saleData, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

export const getSalesLog = async (filter, user_id) => {
  const token = await getToken();
  const params = {};
  if (filter) params.filter = filter;
  if (user_id) params.user_id = user_id;
  const res = await axios.get(`${BASE_URL}/api/sales`, {
    headers: { Authorization: `Bearer ${token}` }, params
  });
  return res.data;
};

export const getNotPaidSales = async () => {
  const token = await getToken();
  const res = await axios.get(`${BASE_URL}/api/sales/not-paid`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};

export const requestSalePayment = async (id, payment_method) => {
  const token = await getToken();
  const res = await axios.patch(`${BASE_URL}/api/sales/request-payment/${id}`,
    { payment_method },
    { headers: { Authorization: `Bearer ${token}` } }
  );
  return res.data;
};

export const approveSalePayment = async (id) => {
  const token = await getToken();
  const res = await axios.patch(`${BASE_URL}/api/sales/approve/${id}`, {}, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return res.data;
};
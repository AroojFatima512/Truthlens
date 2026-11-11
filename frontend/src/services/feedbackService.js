import api from './api';

// All calls send the login token, so the backend knows who is asking.
const apiError = (error, fallback) => new Error(error.response?.data?.message || fallback);

export const submitFeedback = async (data) => {
  try { return (await api.post('/feedback', data)).data.feedback; } catch (e) { throw apiError(e, 'Failed to submit feedback'); }
};
export const fetchMyFeedback = async () => (await api.get('/feedback/mine')).data;              // readers: their own
export const fetchAllFeedback = async () => (await api.get('/feedback')).data;                  // admins: everyone's
export const setFeedbackStatus = async (id, status) => {                                         // admins: 'pending' | 'resolved'
  try { return (await api.patch(`/feedback/${id}`, { status })).data; } catch (e) { throw apiError(e, 'Could not update feedback'); }
};

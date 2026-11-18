const store = {
  async getItem(k: string) {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  async setItem(k: string, v: string) {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* dolu/kapalı */
    }
  },
  async removeItem(k: string) {
    try {
      window.localStorage.removeItem(k);
    } catch {
      /* yok say */
    }
  },
};
export default store;

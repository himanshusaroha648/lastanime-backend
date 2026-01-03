import { HttpsProxyAgent } from 'https-proxy-agent';
import { CONFIG } from './config.js';

class ProxyManager {
  constructor() {
    this.proxies = CONFIG.proxy.list;
    this.currentIndex = 0;
    this.failedProxies = new Set();
  }
  
  getNextProxy() {
    if (this.proxies.length === 0) return null;
    
    // Try to find a working proxy
    const maxAttempts = this.proxies.length;
    for (let i = 0; i < maxAttempts; i++) {
      const proxy = this.proxies[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
      
      // Skip failed proxies temporarily
      if (!this.failedProxies.has(proxy)) {
        return proxy;
      }
    }
    
    // If all proxies failed, clear the failed list and retry
    this.failedProxies.clear();
    return this.proxies[0];
  }
  
  createProxyAgent(proxyString) {
    if (!proxyString) return null;
    
    try {
      const [host, port, username, password] = proxyString.split(':');
      const proxyUrl = username && password
        ? `http://${username}:${password}@${host}:${port}`
        : `http://${host}:${port}`;
      
      return new HttpsProxyAgent(proxyUrl);
    } catch (error) {
      console.error(`❌ Failed to create proxy agent for ${proxyString}:`, error.message);
      return null;
    }
  }
  
  markProxyAsFailed(proxyString) {
    if (proxyString) {
      this.failedProxies.add(proxyString);
      console.log(`⚠️  Marked proxy as failed: ${proxyString.split(':')[0]}`);
    }
  }
  
  getAxiosConfig(baseConfig = {}) {
    const proxyString = this.getNextProxy();
    
    if (proxyString) {
      const agent = this.createProxyAgent(proxyString);
      if (agent) {
        const proxyHost = proxyString.split(':')[0];
        console.log(`🔄 Using proxy: ${proxyHost}`);
        return {
          ...baseConfig,
          httpsAgent: agent,
          httpAgent: agent,
          _proxyString: proxyString,
        };
      }
    }
    
    return baseConfig;
  }
  
  handleProxyError(axiosConfig) {
    if (axiosConfig && axiosConfig._proxyString) {
      this.markProxyAsFailed(axiosConfig._proxyString);
    }
  }
}

export const proxyManager = new ProxyManager();

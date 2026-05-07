import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import * as http from 'http';
import * as https from 'https';
import { URL } from 'url';

export interface ProxyConfig {
  host: string;
  port: number;
  auth?: {
    username: string;
    password: string;
  };
  protocol?: string;
}

export interface DownloaderConfig {
  apiToken?: string;
  mirrorUrl?: string;
  timeout?: number;
  maxRetries?: number;
  proxy?: ProxyConfig | false;
}

export interface FileInfo {
  path: string;
  download_url: string;
}

export class GitHubAPIError extends Error {
  public statusCode: number;

  constructor(statusCode: number, message: string) {
    super(`GitHub API Error [${statusCode}]: ${message}`);
    this.name = 'GitHubAPIError';
    this.statusCode = statusCode;
    Object.setPrototypeOf(this, GitHubAPIError.prototype);
  }

  get message(): string {
    return `GitHub API Error [${this.statusCode}]: ${super.message}`;
  }
}

export class SkillDownloader {
  private apiToken?: string;
  private mirrorUrl: string;
  private timeout: number;
  private maxRetries: number;
  private proxy?: ProxyConfig | false;
  private client: AxiosInstance;

  constructor(config: DownloaderConfig = {}) {
    this.apiToken = config.apiToken;
    this.timeout = config.timeout || 15;
    this.maxRetries = config.maxRetries || 3;
    this.proxy = config.proxy;

    if (config.mirrorUrl !== undefined) {
      this.mirrorUrl = config.mirrorUrl;
    } else {
      this.mirrorUrl = process.env.GITHUB_MIRROR || '';
    }

    const clientConfig: any = {
      timeout: this.timeout * 1000,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ...(this.apiToken ? { 'Authorization': `token ${this.apiToken}` } : {})
      }
    };

    if (this.proxy !== false) {
      const proxyConfig = this.proxy || this._getProxyFromEnv();
      if (proxyConfig) {
        console.log(`Proxy configured (HTTPS CONNECT): ${proxyConfig.host}:${proxyConfig.port}`);
        if (this.mirrorUrl) {
          console.log(`Note: Proxy takes priority over mirror. Mirror will be disabled.`);
        }
      }
    } else {
      console.log('Proxy explicitly disabled');
    }

    this.client = axios.create(clientConfig);

    if (this.mirrorUrl) {
      console.log(`Mirror fallback enabled: ${this.mirrorUrl}`);
    }
  }

  private _getProxyFromEnv(): ProxyConfig | null {
    const proxyUrl = process.env.HTTPS_PROXY || 
                     process.env.HTTP_PROXY || 
                     process.env.https_proxy || 
                     process.env.http_proxy ||
                     process.env.Https_Proxy ||
                     process.env.Http_Proxy;
    
    if (!proxyUrl) {
      return null;
    }

    try {
      const url = new URL(proxyUrl);
      const proxyConfig: ProxyConfig = {
        host: url.hostname,
        port: parseInt(url.port || (url.protocol === 'https:' ? '443' : '80'), 10),
        protocol: url.protocol.replace(':', '')
      };

      if (url.username && url.password) {
        proxyConfig.auth = {
          username: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password)
        };
      }

      console.log(`Detected proxy from environment: ${proxyConfig.protocol}://${proxyConfig.host}:${proxyConfig.port}`);
      return proxyConfig;
    } catch (error) {
      console.warn(`Failed to parse proxy URL from environment: ${proxyUrl}`);
      return null;
    }
  }

  async download(folderUrl: string, targetDir: string = '.'): Promise<string | null> {
    try {
      const parsedInfo = this._parseGitHubUrl(folderUrl);
      if (!parsedInfo) {
        return null;
      }

      const [owner, repo, ref, dirPath, folderName] = parsedInfo;

      const filesToDownload = await this._getFileTree(owner, repo, ref, dirPath);
      if (!filesToDownload || filesToDownload.length === 0) {
        console.warn(`No matching files found or API error for path: ${dirPath}`);
        return null;
      }

      let successCount = 0;
      const failedFiles: string[] = [];

      for (const fileInfo of filesToDownload) {
        const isSuccess = await this._downloadSingleFile(
          owner, repo, ref, dirPath, fileInfo, folderName, targetDir
        );
        if (isSuccess) {
          successCount++;
        } else {
          failedFiles.push(fileInfo.path || 'Unknown path');
        }
      }

      if (successCount === 0) {
        console.error('Failed to download any files. Please verify network connectivity and GitHub API limits.');
        return null;
      }

      const finalPath = path.resolve(path.join(targetDir, folderName));

      if (failedFiles.length > 0) {
        console.warn(`Successfully downloaded ${successCount} file(s) to ${finalPath}, but ${failedFiles.length} failed.`);
        console.warn('The following files could not be downloaded:');
        for (const f of failedFiles) {
          console.warn(`  - ${f}`);
        }
      } else {
        console.log(`Skill installed successfully at: ${finalPath}`);
      }

      return finalPath;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        throw error;
      }
      console.error(`Critical error during skill installation: ${error}`);
      return null;
    }
  }

  _parseGitHubUrl(url: string): [string, string, string, string, string] | null {
    const parts = url.trim().split('/');
    if (parts.length < 7) {
      console.error(`Invalid GitHub URL format provided: ${url}`);
      return null;
    }

    const owner = parts[3];
    const repo = parts[4];
    const ref = parts[6];
    const dirPath = parts.slice(7).join('/');
    const folderName = parts[parts.length - 1];

    return [owner, repo, ref, dirPath, folderName];
  }

  async _getFileTree(owner: string, repo: string, ref: string, dirPath: string): Promise<FileInfo[]> {
    const filesToDownload: FileInfo[] = [];
    const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents/${dirPath}?ref=${ref}`;

    try {
      const response = await this._requestWithRetry(apiUrl);

      if (!response) {
        console.error(`GitHub API request failed after retries: ${apiUrl}`);
        throw new GitHubAPIError(0, 'Request failed after retries (timeout or connection error)');
      }

      const status = response.status;
      if (status !== 200) {
        let errorMsg = response.data?.message || response.data?.toString() || 'Unknown error';
        throw new GitHubAPIError(status, errorMsg);
      }

      const contents = response.data;

      if (contents && typeof contents === 'object' && !Array.isArray(contents) && (contents as any).type === 'file') {
        return [{
          path: (contents as any).path || '',
          download_url: (contents as any).download_url || ''
        }];
      }

      if (Array.isArray(contents)) {
        for (const item of contents) {
          if (item.type === 'file') {
            filesToDownload.push({
              path: item.path || '',
              download_url: item.download_url || ''
            });
          } else if (item.type === 'dir') {
            const subPath = item.path || '';
            const subFiles = await this._getFileTree(owner, repo, ref, subPath);
            filesToDownload.push(...subFiles);
          }
        }
      }

      return filesToDownload;
    } catch (error) {
      if (error instanceof GitHubAPIError) {
        throw error;
      }
      console.error(`Failed to retrieve file tree for ${dirPath}: ${error}`);
      return [];
    }
  }

  async _downloadSingleFile(
    owner: string,
    repo: string,
    ref: string,
    dirPath: string,
    fileInfo: FileInfo,
    folderName: string,
    targetDir: string
  ): Promise<boolean> {
    let rawUrl = fileInfo.download_url;
    const filePath = fileInfo.path;

    if (!rawUrl) {
      rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${filePath}`;
    }

    let relativePath: string;
    if (filePath === dirPath) {
      relativePath = path.basename(filePath);
    } else {
      relativePath = filePath.replace(`${dirPath}/`, '');
    }

    relativePath = relativePath.replace(/^\//, '');
    const localFilePath = path.join(targetDir, folderName, relativePath);

    const dirExists = fs.existsSync(path.dirname(localFilePath));
    if (!dirExists) {
      fs.mkdirSync(path.dirname(localFilePath), { recursive: true });
    }

    const mirrorUrl = this._shouldUseMirror() ? this._buildMirrorUrl(rawUrl) : null;
    const downloadUrl = mirrorUrl || rawUrl;

    try {
      const response = await this._requestWithRetry(downloadUrl);
      if (response && response.status === 200) {
        fs.writeFileSync(localFilePath, response.data);
        return true;
      }
      const status = response?.status || 'no response';
      console.warn(`Failed to download ${filePath} (status: ${status})`);
      return false;
    } catch (error) {
      console.warn(`Failed to download ${filePath}: ${error}`);
      return false;
    }
  }

  _buildMirrorUrl(originalUrl: string): string | null {
    if (!this.mirrorUrl) {
      return null;
    }
    if (!originalUrl.includes('raw.githubusercontent.com')) {
      return null;
    }

    const mirror = this.mirrorUrl.replace(/\/$/, '');
    return `${mirror}/${originalUrl}`;
  }

  _shouldUseMirror(): boolean {
    const hasProxy = this.proxy !== false && (this.proxy || this._getProxyFromEnv());
    if (hasProxy) {
      console.log('Proxy is configured, skipping mirror to avoid conflicts');
      return false;
    }
    return true;
  }

  private async _requestWithRetry(
    url: string,
    timeout?: number,
    maxRetries?: number,
    baseDelay: number = 1.0
  ): Promise<AxiosResponse | null> {
    const requestTimeout = timeout !== undefined ? timeout : this.timeout;
    const retries = maxRetries !== undefined ? maxRetries : this.maxRetries;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await this._requestViaProxy(url, requestTimeout * 1000);

        if (response.status === 403) {
          const remaining = response.headers['x-ratelimit-remaining'];
          if (remaining === '0') {
            const resetTime = parseInt(response.headers['x-ratelimit-reset'] || '0', 10);
            const waitSeconds = Math.max(0, resetTime - Math.floor(Date.now() / 1000));
            console.warn(`GitHub rate limit exceeded. Resets in ${waitSeconds}s`);
            if (waitSeconds < 60) {
              await this._sleep(waitSeconds + 1);
              continue;
            }
          }
        }

        return response;
      } catch (error: any) {
        if (error.code === 'ECONNABORTED' || error.message?.includes('timeout')) {
          if (attempt < retries) {
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.warn(`Timeout (attempt ${attempt}/${retries}), retry in ${delay.toFixed(1)}s: ${url}`);
            await this._sleep(delay);
          } else {
            console.error(`Request timed out after ${retries} attempts: ${url}`);
            return null;
          }
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET' || error.code === 'socket hang up') {
          if (attempt < retries) {
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.warn(`Connection error (attempt ${attempt}/${retries}), retry in ${delay.toFixed(1)}s: ${url}`);
            await this._sleep(delay);
          } else {
            console.error(`Connection failed after ${retries} attempts: ${url}`);
            return null;
          }
        } else if (error.code === 'ETIMEDOUT') {
          if (attempt < retries) {
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.warn(`Connection timed out (attempt ${attempt}/${retries}), retry in ${delay.toFixed(1)}s: ${url}`);
            await this._sleep(delay);
          } else {
            console.error(`Connection timed out after ${retries} attempts: ${url}`);
            return null;
          }
        } else if (error.code === 'HPE_INVALID_CONSTANT' || error.message?.includes('Parse Error')) {
          console.error(`Proxy/Mirror parse error detected: ${error.message}`);
          console.error('This usually indicates the proxy is returning invalid HTTP responses.');
          console.error('Possible causes:');
          console.error('  1. Proxy server does not support HTTPS requests');
          console.error('  2. Proxy address or port is incorrect');
          console.error('  3. Proxy server is malfunctioning');
          console.error('  4. Proxy requires special authentication or configuration');
          console.error('');
          console.error('Recommendations:');
          console.error('  1. Try disabling proxy: githubProxy: false in config');
          console.error('  2. Try using HTTPS_PROXY instead of HTTP_PROXY');
          console.error('  3. Try using mirror URL without proxy');
          console.error('  4. Set GITHUB_TOKEN for direct GitHub access');
          console.error('  5. Check if your proxy supports HTTPS tunneling (CONNECT method)');
          return null;
        } else {
          const errorMessage = error.message || error.toString();
          const errorCode = error.code || 'unknown';
          console.error(`Request failed: ${errorMessage} (code: ${errorCode})`);
          console.error('Possible causes:');
          console.error('  - GitHub API rate limit exceeded (60 requests/hour for unauthenticated)');
          console.error('  - Network connectivity issues or proxy configuration');
          console.error('  - GitHub is temporarily blocking your IP');
          console.error('Suggestions:');
          console.error('  - Set GITHUB_TOKEN environment variable for authenticated requests');
          console.error('  - Configure mirror URL with GITHUB_MIRROR environment variable');
          console.error('  - Wait and retry later if rate limited');
          return null;
        }
      }
    }

    return null;
  }

  /**
   * 使用 CONNECT 隧道发送请求（模仿 Python requests 的实现）
   */
  private _requestViaProxy(url: string, timeout: number): Promise<AxiosResponse> {
    return new Promise((resolve, reject) => {
      const target = new URL(url);
      const isHttps = target.protocol === 'https:';
      const proxyConfig = this.proxy !== false ? (this.proxy || this._getProxyFromEnv()) : null;

      // 如果没有配置代理，直接使用 axios
      if (!proxyConfig) {
        this.client.get(url, { timeout }).then(resolve).catch(reject);
        return;
      }

      const proxyUrl = `http://${proxyConfig.host}:${proxyConfig.port}`;
      const proxyParsed = new URL(proxyUrl);

      // 1. 建立到代理的 CONNECT 隧道
      const connectOptions = {
        host: proxyParsed.hostname,
        port: proxyParsed.port || 80,
        method: 'CONNECT',
        path: `${target.hostname}:${target.port || (isHttps ? 443 : 80)}`,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      };

      const req = http.request(connectOptions);

      const timeoutId = setTimeout(() => {
        req.destroy();
        reject(new Error('Request timeout'));
      }, timeout);

      req.on('connect', (res, socket, head) => {
        clearTimeout(timeoutId);

        if (res.statusCode !== 200) {
          reject(new Error(`CONNECT failed: ${res.statusCode}`));
          return;
        }

        // 2. 通过隧道发送实际请求
        const options: any = {
          socket: socket,
          method: 'GET',
          path: `${target.pathname}${target.search}`,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/vnd.github.v3+json',
            'Host': target.hostname,
            ...(this.apiToken ? { 'Authorization': `token ${this.apiToken}` } : {})
          }
        };

        const client = isHttps ? https.request(options) : http.request(options);

        client.on('response', (response) => {
          let data = '';
          response.on('data', (chunk) => {
            data += chunk;
          });
          response.on('end', () => {
            const contentType = response.headers['content-type'] || '';
            let parsedData = data;
            
            // 如果是 JSON 格式，尝试解析
            if (contentType.includes('application/json') || contentType.includes('text/plain')) {
              try {
                parsedData = JSON.parse(data);
              } catch (e) {
                // 如果解析失败，保持原字符串
                parsedData = data;
              }
            }
            
            resolve({
              status: response.statusCode,
              headers: response.headers,
              data: parsedData
            } as AxiosResponse);
          });
        });

        client.on('error', (err) => {
          reject(err);
        });

        client.end();
      });

      req.on('error', (err) => {
        clearTimeout(timeoutId);
        reject(err);
      });

      req.end();
    });
  }

  private _sleep(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }

  async testProxy(url: string = 'https://api.github.com'): Promise<{ success: boolean; error?: string }> {
    console.log(`Testing proxy with URL: ${url}`);
    try {
      const response = await this.client.get(url, { timeout: 5000 });
      console.log(`Proxy test successful: ${response.status}`);
      return { success: true };
    } catch (error: any) {
      const errorMessage = error.message || error.toString();
      console.error(`Proxy test failed: ${errorMessage}`);
      return { success: false, error: errorMessage };
    }
  }

  getProxyInfo(): { enabled: boolean; proxy?: ProxyConfig } {
    const proxyConfig = this.proxy !== false ? (this.proxy || this._getProxyFromEnv()) : null;
    return {
      enabled: !!proxyConfig,
      proxy: proxyConfig || undefined
    };
  }
}

export default SkillDownloader;
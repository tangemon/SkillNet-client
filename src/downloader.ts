import axios, { AxiosInstance, AxiosResponse } from 'axios';
import * as fs from 'fs';
import * as path from 'path';

export interface DownloaderConfig {
  apiToken?: string;
  mirrorUrl?: string;
  timeout?: number;
  maxRetries?: number;
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
  private client: AxiosInstance;

  constructor(config: DownloaderConfig = {}) {
    this.apiToken = config.apiToken;
    this.timeout = config.timeout || 15;
    this.maxRetries = config.maxRetries || 3;

    if (config.mirrorUrl !== undefined) {
      this.mirrorUrl = config.mirrorUrl;
    } else {
      this.mirrorUrl = process.env.GITHUB_MIRROR || '';
    }

    this.client = axios.create({
      timeout: this.timeout * 1000,
      headers: {
        'Accept': 'application/vnd.github.v3+json',
        ...(this.apiToken ? { 'Authorization': `token ${this.apiToken}` } : {})
      }
    });

    if (this.mirrorUrl) {
      console.log(`Mirror fallback enabled: ${this.mirrorUrl}`);
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

    const mirrorUrl = this._buildMirrorUrl(rawUrl);
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
        const response = await this.client.get(url, { timeout: requestTimeout * 1000 });

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
        } else if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
          if (attempt < retries) {
            const delay = baseDelay * Math.pow(2, attempt - 1);
            console.warn(`Connection error (attempt ${attempt}/${retries}), retry in ${delay.toFixed(1)}s: ${url}`);
            await this._sleep(delay);
          } else {
            console.error(`Connection failed after ${retries} attempts: ${url}`);
            return null;
          }
        } else {
          console.error(`Request failed: ${error}`);
          return null;
        }
      }
    }

    return null;
  }

  private _sleep(seconds: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, seconds * 1000));
  }
}

export default SkillDownloader;
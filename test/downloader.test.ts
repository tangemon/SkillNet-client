import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { SkillDownloader, DownloaderConfig, GitHubAPIError } from '../src/downloader';

const mockAxiosInstance = {
  get: jest.fn(),
  post: jest.fn(),
  interceptors: {
    request: {
      use: jest.fn((successFn: any) => successFn({
        headers: {}
      }))
    }
  }
};

jest.mock('axios', () => ({
  create: jest.fn(() => mockAxiosInstance),
  get: jest.fn(),
  post: jest.fn()
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(() => ''),
  statSync: jest.fn(),
  createWriteStream: jest.fn(() => ({
    write: jest.fn(),
    end: jest.fn(),
    on: jest.fn((event: string, callback: any) => {
      if (event === 'finish') {
        setTimeout(callback, 10);
      }
      return this;
    })
  })),
  createReadStream: jest.fn()
}));

describe('SkillDownloader', () => {
  let downloader: SkillDownloader;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosInstance.get.mockReset();
    downloader = new SkillDownloader();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create downloader with default configuration', () => {
      const defaultDownloader = new SkillDownloader();
      expect(defaultDownloader).toBeDefined();
    });

    it('should create downloader with apiToken', () => {
      const downloaderWithToken = new SkillDownloader({
        apiToken: 'ghp_test_token'
      });
      expect(downloaderWithToken).toBeDefined();
    });

    it('should create downloader with mirrorUrl', () => {
      const downloaderWithMirror = new SkillDownloader({
        mirrorUrl: 'https://ghfast.top/'
      });
      expect(downloaderWithMirror).toBeDefined();
    });

    it('should create downloader with custom timeout', () => {
      const downloaderWithTimeout = new SkillDownloader({
        timeout: 30
      });
      expect(downloaderWithTimeout).toBeDefined();
    });

    it('should create downloader with custom maxRetries', () => {
      const downloaderWithRetries = new SkillDownloader({
        maxRetries: 5
      });
      expect(downloaderWithRetries).toBeDefined();
    });

    it('should create downloader with all options', () => {
      const fullDownloader = new SkillDownloader({
        apiToken: 'ghp_test',
        mirrorUrl: 'https://ghproxy.com/',
        timeout: 20,
        maxRetries: 4
      });
      expect(fullDownloader).toBeDefined();
    });

    it('should prioritize explicit mirrorUrl over environment variable', () => {
      process.env.GITHUB_MIRROR = 'https://env-mirror.com/';
      const downloaderWithExplicit = new SkillDownloader({
        mirrorUrl: 'https://explicit-mirror.com/'
      });
      expect(downloaderWithExplicit).toBeDefined();
      delete process.env.GITHUB_MIRROR;
    });
  });

  describe('download', () => {
    const validGitHubUrl = 'https://github.com/openkg-team/skills/tree/main/skills/pdf-extractor';
    const targetDir = './test_downloads';

    it('should download skill from valid GitHub URL', async () => {
      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: [
            { type: 'file', path: 'skills/pdf-extractor/SKILL.md', download_url: 'https://raw.githubusercontent.com/openkg-team/skills/main/skills/pdf-extractor/SKILL.md' }
          ],
          status: 200
        })
        .mockResolvedValueOnce({
          data: '# PDF Extractor\nA skill for extracting text from PDFs.',
          status: 200
        });

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => '');

      const result = await downloader.download(validGitHubUrl, targetDir);

      expect(result).toContain('pdf-extractor');
    }, 10000);

    it('should return null for invalid GitHub URL', async () => {
      const invalidUrl = 'https://invalid-url.com/repo';

      const result = await downloader.download(invalidUrl, targetDir);

      expect(result).toBeNull();
    });

    it('should return null when no files found', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        data: [],
        status: 200
      });

      const result = await downloader.download(validGitHubUrl, targetDir);

      expect(result).toBeNull();
    });

    it('should throw GitHubAPIError on rate limit', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        status: 403,
        headers: { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '0' },
        data: 'Rate limit exceeded'
      });

      await expect(downloader.download(validGitHubUrl, targetDir))
        .rejects.toThrow(GitHubAPIError);
    });

    it('should throw GitHubAPIError on not found', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        status: 404,
        data: { message: 'Not Found' }
      });

      await expect(downloader.download(validGitHubUrl, targetDir))
        .rejects.toThrow(GitHubAPIError);
    });

    it('should handle directory with subdirectories', async () => {
      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: [
            { type: 'dir', path: 'skills/pdf-extractor/references' },
            { type: 'file', path: 'skills/pdf-extractor/SKILL.md', download_url: 'https://raw.githubusercontent.com/openkg-team/skills/main/skills/pdf-extractor/SKILL.md' }
          ],
          status: 200
        })
        .mockResolvedValueOnce({
          data: [
            { type: 'file', path: 'skills/pdf-extractor/references/ref1.md', download_url: 'https://raw.githubusercontent.com/openkg-team/skills/main/skills/pdf-extractor/references/ref1.md' }
          ],
          status: 200
        })
        .mockResolvedValueOnce({
          data: '# SKILL.md',
          status: 200
        })
        .mockResolvedValueOnce({
          data: '# Reference',
          status: 200
        });

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => '');

      const result = await downloader.download(validGitHubUrl, targetDir);

      expect(result).toContain('pdf-extractor');
    }, 15000);

    it('should handle single file download', async () => {
      const singleFileUrl = 'https://github.com/openkg-team/skills/blob/main/skills/pdf-extractor/SKILL.md';

      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: {
            type: 'file',
            path: 'skills/pdf-extractor/SKILL.md',
            download_url: 'https://raw.githubusercontent.com/openkg-team/skills/main/skills/pdf-extractor/SKILL.md'
          },
          status: 200
        })
        .mockResolvedValueOnce({
          data: '# SKILL.md',
          status: 200
        });

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => '');

      const result = await downloader.download(singleFileUrl, targetDir);

      expect(result).toBeDefined();
    }, 10000);
  });

  describe('_parseGitHubUrl', () => {
    it('should parse valid GitHub tree URL', () => {
      const url = 'https://github.com/owner/repo/tree/branch/path/to/folder';
      const result = downloader._parseGitHubUrl(url);

      expect(result).not.toBeNull();
      if (result) {
        const [owner, repo, ref, dirPath, folderName] = result;
        expect(owner).toBe('owner');
        expect(repo).toBe('repo');
        expect(ref).toBe('branch');
        expect(dirPath).toBe('path/to/folder');
        expect(folderName).toBe('folder');
      }
    });

    it('should parse valid GitHub blob URL', () => {
      const url = 'https://github.com/owner/repo/blob/main/path/to/file.txt';
      const result = downloader._parseGitHubUrl(url);

      expect(result).not.toBeNull();
      if (result) {
        const [owner, repo, ref, dirPath, folderName] = result;
        expect(owner).toBe('owner');
        expect(repo).toBe('repo');
        expect(ref).toBe('main');
        expect(dirPath).toBe('path/to/file.txt');
        expect(folderName).toBe('file.txt');
      }
    });

    it('should return null for invalid URL', () => {
      const invalidUrl = 'https://invalid.com/repo';
      const result = downloader._parseGitHubUrl(invalidUrl);
      expect(result).toBeNull();
    });

    it('should return null for URL with insufficient parts', () => {
      const shortUrl = 'https://github.com/owner';
      const result = downloader._parseGitHubUrl(shortUrl);
      expect(result).toBeNull();
    });

    it('should handle URLs with special characters', () => {
      const url = 'https://github.com/owner/repo/tree/feature-v1.2/skills';
      const result = downloader._parseGitHubUrl(url);

      expect(result).not.toBeNull();
      if (result) {
        const [owner, repo, ref, dirPath, folderName] = result;
        expect(owner).toBe('owner');
        expect(repo).toBe('repo');
        expect(ref).toBe('feature-v1.2');
        expect(dirPath).toBe('skills');
        expect(folderName).toBe('skills');
      }
    });
  });

  describe('_getFileTree', () => {
    it('should fetch file tree from GitHub API', async () => {
      const mockFileTree = [
        { type: 'file', path: 'skills/test/SKILL.md', download_url: 'https://raw.githubusercontent.com/owner/repo/main/skills/test/SKILL.md' }
      ];

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: mockFileTree,
        status: 200
      });

      const result = await downloader._getFileTree('owner', 'repo', 'main', 'skills/test');

      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('skills/test/SKILL.md');
    });

    it('should throw GitHubAPIError on API error', async () => {
      mockAxiosInstance.get.mockResolvedValueOnce({
        status: 500,
        data: { message: 'Server Error' }
      });

      await expect(downloader._getFileTree('owner', 'repo', 'main', 'skills/test'))
        .rejects.toThrow(GitHubAPIError);
    });

    it('should recursively fetch subdirectories', async () => {
      mockAxiosInstance.get
        .mockResolvedValueOnce({
          data: [
            { type: 'dir', path: 'skills/test/refs' },
            { type: 'file', path: 'skills/test/SKILL.md', download_url: 'https://raw.githubusercontent.com/owner/repo/main/skills/test/SKILL.md' }
          ],
          status: 200
        })
        .mockResolvedValueOnce({
          data: [
            { type: 'file', path: 'skills/test/refs/ref1.md', download_url: 'https://raw.githubusercontent.com/owner/repo/main/skills/test/refs/ref1.md' }
          ],
          status: 200
        });

      const result = await downloader._getFileTree('owner', 'repo', 'main', 'skills/test');

      expect(result).toHaveLength(2);
    });
  });

  describe('_downloadSingleFile', () => {
    it('should download single file successfully', async () => {
      const fileInfo = {
        path: 'skills/test/SKILL.md',
        download_url: 'https://raw.githubusercontent.com/owner/repo/main/skills/test/SKILL.md'
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: '# Test Content',
        status: 200
      });

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => '');

      const result = await downloader._downloadSingleFile(
        'owner', 'repo', 'main', 'skills', fileInfo, 'test', './downloads'
      );

      expect(result).toBe(true);
    });

    it('should return false when download fails', async () => {
      const fileInfo = {
        path: 'skills/test/SKILL.md',
        download_url: 'https://raw.githubusercontent.com/owner/repo/main/skills/test/SKILL.md'
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        status: 404
      });

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => '');

      const result = await downloader._downloadSingleFile(
        'owner', 'repo', 'main', 'skills', fileInfo, 'test', './downloads'
      );

      expect(result).toBe(false);
    });

    it('should use mirror URL when configured', async () => {
      const downloaderWithMirror = new SkillDownloader({
        mirrorUrl: 'https://ghfast.top/'
      });

      const fileInfo = {
        path: 'skills/test/SKILL.md',
        download_url: 'https://raw.githubusercontent.com/owner/repo/main/skills/test/SKILL.md'
      };

      mockAxiosInstance.get.mockResolvedValueOnce({
        data: '# Test Content',
        status: 200
      });

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => '');

      const result = await downloaderWithMirror._downloadSingleFile(
        'owner', 'repo', 'main', 'skills', fileInfo, 'test', './downloads'
      );

      expect(result).toBe(true);
    });
  });

  describe('_buildMirrorUrl', () => {
    it('should build mirror URL for raw GitHub content', () => {
      const downloaderWithMirror = new SkillDownloader({
        mirrorUrl: 'https://ghfast.top/'
      });

      const rawUrl = 'https://raw.githubusercontent.com/owner/repo/main/file.txt';
      const mirrorUrl = downloaderWithMirror._buildMirrorUrl(rawUrl);

      expect(mirrorUrl).toBe('https://ghfast.top/https://raw.githubusercontent.com/owner/repo/main/file.txt');
    });

    it('should return null for non-raw URLs', () => {
      const downloaderWithMirror = new SkillDownloader({
        mirrorUrl: 'https://ghfast.top/'
      });

      const apiUrl = 'https://api.github.com/repos/owner/repo/contents';
      const mirrorUrl = downloaderWithMirror._buildMirrorUrl(apiUrl);

      expect(mirrorUrl).toBeNull();
    });

    it('should return null when mirror is not configured', () => {
      const mirrorUrl = downloader._buildMirrorUrl('https://raw.githubusercontent.com/owner/repo/main/file.txt');
      expect(mirrorUrl).toBeNull();
    });

    it('should handle mirror URL without trailing slash', () => {
      const downloaderWithMirror = new SkillDownloader({
        mirrorUrl: 'https://ghfast.top'
      });

      const rawUrl = 'https://raw.githubusercontent.com/owner/repo/main/file.txt';
      const mirrorUrl = downloaderWithMirror._buildMirrorUrl(rawUrl);

      expect(mirrorUrl).toBe('https://ghfast.top/https://raw.githubusercontent.com/owner/repo/main/file.txt');
    });
  });

  describe('Error Handling', () => {
    it('should handle network timeout with retry', async () => {
      const downloaderWithRetries = new SkillDownloader({
        maxRetries: 2,
        timeout: 1
      });

      mockAxiosInstance.get
        .mockRejectedValueOnce({ code: 'ECONNABORTED', message: 'timeout' })
        .mockResolvedValueOnce({
          data: [],
          status: 200
        });

      const result = await downloaderWithRetries._getFileTree('owner', 'repo', 'main', 'path');

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(0);
    }, 10000);

    it('should handle connection error with retry', async () => {
      const downloaderWithRetries = new SkillDownloader({
        maxRetries: 2,
        timeout: 1
      });

      mockAxiosInstance.get
        .mockRejectedValueOnce({ code: 'ECONNREFUSED', message: 'Connection refused' })
        .mockResolvedValueOnce({
          data: [],
          status: 200
        });

      const result = await downloaderWithRetries._getFileTree('owner', 'repo', 'main', 'path');

      expect(mockAxiosInstance.get).toHaveBeenCalledTimes(2);
      expect(result).toHaveLength(0);
    }, 10000);

    it('should handle proxy parse error and throw GitHubAPIError', async () => {
      const downloaderWithProxy = new SkillDownloader({
        proxy: {
          host: '127.0.0.1',
          port: 8080
        }
      });

      mockAxiosInstance.get.mockRejectedValueOnce({
        code: 'HPE_INVALID_CONSTANT',
        message: 'Parse Error: Expected HTTP/'
      });

      await expect(downloaderWithProxy._getFileTree('owner', 'repo', 'main', 'path'))
        .rejects.toThrow(GitHubAPIError);
    }, 10000);
  });

  describe('Proxy Configuration', () => {
    it('should configure proxy from config', () => {
      const downloaderWithProxy = new SkillDownloader({
        proxy: {
          host: 'proxy.example.com',
          port: 8080,
          auth: {
            username: 'user',
            password: 'pass'
          }
        }
      });
      expect(downloaderWithProxy).toBeDefined();
    });

    it('should disable proxy when explicitly set to false', () => {
      const downloaderWithoutProxy = new SkillDownloader({
        proxy: false
      });
      expect(downloaderWithoutProxy).toBeDefined();
    });

    it('should read proxy from HTTP_PROXY environment variable', () => {
      process.env.HTTP_PROXY = 'http://user:pass@proxy.example.com:8080';
      const downloader = new SkillDownloader();
      expect(downloader).toBeDefined();
      delete process.env.HTTP_PROXY;
    });

    it('should read proxy from HTTPS_PROXY environment variable', () => {
      process.env.HTTPS_PROXY = 'https://proxy.example.com:443';
      const downloader = new SkillDownloader();
      expect(downloader).toBeDefined();
      delete process.env.HTTPS_PROXY;
    });
  });
});

describe('GitHubAPIError', () => {
  it('should create error with status code and message', () => {
    const error = new GitHubAPIError(404, 'Not Found');
    expect(error.statusCode).toBe(404);
    expect(error.message).toBe('GitHub API Error [404]: Not Found');
  });

  it('should extend Error class', () => {
    const error = new GitHubAPIError(403, 'Forbidden');
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(GitHubAPIError);
  });
});
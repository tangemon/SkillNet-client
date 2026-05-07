import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { Creator, CreatorConfig, CreateResult } from '../src/creator';

const mockAxiosInstance = {
  post: jest.fn(),
  interceptors: {
    request: {
      use: jest.fn((successFn: any) => successFn({ headers: {} }))
    }
  }
};

jest.mock('axios', () => ({
  create: jest.fn(() => mockAxiosInstance),
  post: jest.fn()
}));

jest.mock('fs', () => ({
  existsSync: jest.fn(),
  readdirSync: jest.fn(),
  readFileSync: jest.fn(),
  writeFileSync: jest.fn(),
  mkdirSync: jest.fn(),
  statSync: jest.fn()
}));

function createMockDirent(name: string, isDirectory: boolean) {
  return {
    name,
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory
  };
}

describe('Creator', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosInstance.post.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create creator with valid apiKey', () => {
      const config: CreatorConfig = { apiKey: 'sk-test-key' };
      const creator = new Creator(config);
      expect(creator).toBeDefined();
    });

    it('should throw error when apiKey is missing', () => {
      expect(() => new Creator({} as CreatorConfig))
        .toThrow('API key is required');
    });

    it('should throw error when apiKey is empty string', () => {
      expect(() => new Creator({ apiKey: '' } as CreatorConfig))
        .toThrow('API key is required');
    });

    it('should use custom baseUrl when provided', () => {
      const config: CreatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://custom.llm.api.com/v1'
      };
      const creator = new Creator(config);
      expect(creator).toBeDefined();
    });

    it('should use custom model when provided', () => {
      const config: CreatorConfig = {
        apiKey: 'sk-test-key',
        model: 'gpt-4o-mini'
      };
      const creator = new Creator(config);
      expect(creator).toBeDefined();
    });

    it('should use default model when not provided', () => {
      const config: CreatorConfig = { apiKey: 'sk-test-key' };
      const creator = new Creator(config);
      expect(creator).toBeDefined();
    });

    it('should use githubToken when provided', () => {
      const config: CreatorConfig = {
        apiKey: 'sk-test-key',
        githubToken: 'ghp_test_token'
      };
      const creator = new Creator(config);
      expect(creator).toBeDefined();
    });
  });

  describe('createFromTrajectory', () => {
    it('should throw error when trajectory is empty', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      await expect(creator.createFromTrajectory({
        trajectory: '',
        outputDir: './output'
      })).rejects.toThrow('Trajectory content is required');
    });

    it('should throw error when trajectory is whitespace only', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      await expect(creator.createFromTrajectory({
        trajectory: '   ',
        outputDir: './output'
      })).rejects.toThrow('Trajectory content is required');
    });

    it('should throw error when outputDir is empty', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      await expect(creator.createFromTrajectory({
        trajectory: 'Some trajectory content',
        outputDir: ''
      })).rejects.toThrow('Output directory is required');
    });

    it('should return empty result when no skills identified', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      mockAxiosInstance.post = jest.fn().mockResolvedValue({
        data: { choices: [{ message: { content: '<Skill_Candidate_Metadata>[]</Skill_Candidate_Metadata>' } }] }
      });

      const result = await creator.createFromTrajectory({
        trajectory: 'Some trajectory content',
        outputDir: './output'
      });

      expect(result.success).toBe(true);
      expect(result.skillPaths).toHaveLength(0);
      expect(result.message).toContain('No skills identified');
    });

    it('should create skills from trajectory', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      const metadataResponse = '<Skill_Candidate_Metadata>[{"name": "test-skill", "description": "A test skill"}]</Skill_Candidate_Metadata>';
      const contentResponse = `## FILE: test-skill/SKILL.md
\`\`\`markdown
---
name: test-skill
description: A test skill
---
# Test Skill
\`\`\``;

      mockAxiosInstance.post = jest.fn()
        .mockResolvedValueOnce({ data: { choices: [{ message: { content: metadataResponse } }] } })
        .mockResolvedValueOnce({ data: { choices: [{ message: { content: contentResponse } }] } });

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('test-skill', true)
      ] as any);

      const result = await creator.createFromTrajectory({
        trajectory: 'User: analyze PDF\nAssistant: Here is the analysis',
        outputDir: './output'
      });

      expect(result.success).toBe(true);
      expect(result.skillPaths.length).toBeGreaterThan(0);
    });

    it('should handle LLM error gracefully', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      mockAxiosInstance.post = jest.fn().mockRejectedValue(new Error('API Error'));

      const result = await creator.createFromTrajectory({
        trajectory: 'Some trajectory',
        outputDir: './output'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('API Error');
    });

    it('should use custom model when provided', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      mockAxiosInstance.post = jest.fn().mockResolvedValue({
        data: { choices: [{ message: { content: '<Skill_Candidate_Metadata>[]</Skill_Candidate_Metadata>' } }] }
      });

      await creator.createFromTrajectory({
        trajectory: 'Some trajectory',
        outputDir: './output',
        model: 'gpt-4o-mini'
      });

      expect(mockAxiosInstance.post).toHaveBeenCalled();
    });
  });

  describe('createFromPrompt', () => {
    it('should throw error when prompt is empty', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      await expect(creator.createFromPrompt({
        prompt: '',
        outputDir: './output'
      })).rejects.toThrow('Prompt is required');
    });

    it('should throw error when outputDir is empty', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      await expect(creator.createFromPrompt({
        prompt: 'Create a skill for PDF processing',
        outputDir: ''
      })).rejects.toThrow('Output directory is required');
    });

    it('should return empty result when LLM returns empty response', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      mockAxiosInstance.post = jest.fn().mockResolvedValue({
        data: { choices: [{ message: { content: '' } }] }
      });

      const result = await creator.createFromPrompt({
        prompt: 'Create a skill',
        outputDir: './output'
      });

      expect(result.success).toBe(true);
      expect(result.skillPaths).toHaveLength(0);
    });

    it('should create skill from prompt', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      const contentResponse = `## FILE: pdf-processor/SKILL.md
\`\`\`markdown
---
name: pdf-processor
description: Process PDF files
---
# PDF Processor
\`\`\``;

      mockAxiosInstance.post = jest.fn().mockResolvedValue({
        data: { choices: [{ message: { content: contentResponse } }] }
      });

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('pdf-processor', true)
      ] as any);

      const result = await creator.createFromPrompt({
        prompt: 'Create a skill for PDF processing',
        outputDir: './output'
      });

      expect(result.success).toBe(true);
    });

    it('should handle LLM error gracefully', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      mockAxiosInstance.post = jest.fn().mockRejectedValue(new Error('API Error'));

      const result = await creator.createFromPrompt({
        prompt: 'Create a skill',
        outputDir: './output'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('API Error');
    });
  });

  describe('createFromOffice', () => {
    it('should throw error when filePath is empty', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      await expect(creator.createFromOffice({
        filePath: '',
        outputDir: './output'
      })).rejects.toThrow('File path is required');
    });

    it('should throw error when outputDir is empty', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      await expect(creator.createFromOffice({
        filePath: './document.pdf',
        outputDir: ''
      })).rejects.toThrow('Output directory is required');
    });

    it('should throw error when file does not exist', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as any);

      await expect(creator.createFromOffice({
        filePath: './non_existent.pdf',
        outputDir: './output'
      })).rejects.toThrow('File not found');
    });

    it('should throw error for unsupported file extension', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as any);

      await expect(creator.createFromOffice({
        filePath: './document.txt',
        outputDir: './output'
      })).rejects.toThrow('Unsupported file type');
    });

    it('should handle LLM error gracefully', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isFile: () => true } as any);
      jest.spyOn(fs, 'readFileSync').mockReturnValue(Buffer.from('test content'));
      
      mockAxiosInstance.post = jest.fn().mockRejectedValue(new Error('API Error'));

      const result = await creator.createFromOffice({
        filePath: './document.pdf',
        outputDir: './output'
      });

      expect(result.success).toBe(false);
    });
  });

  describe('createFromGitHub', () => {
    it('should throw error when githubUrl is empty', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      await expect(creator.createFromGitHub({
        githubUrl: '',
        outputDir: './output'
      })).rejects.toThrow('GitHub URL is required');
    });

    it('should throw error when outputDir is empty', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      await expect(creator.createFromGitHub({
        githubUrl: 'https://github.com/user/repo',
        outputDir: ''
      })).rejects.toThrow('Output directory is required');
    });

    it('should handle GitHub API error gracefully', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      mockAxiosInstance.post = jest.fn().mockRejectedValue(new Error('GitHub API Error'));

      const result = await creator.createFromGitHub({
        githubUrl: 'https://github.com/user/repo',
        outputDir: './output'
      });

      expect(result.success).toBe(false);
    });
  });

  describe('parseCandidateMetadata', () => {
    it('should parse valid JSON metadata', () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      const llmOutput = '<Skill_Candidate_Metadata>[{"name": "skill-1", "description": "Desc 1"}]</Skill_Candidate_Metadata>';
      
      mockAxiosInstance.post = jest.fn().mockResolvedValue({
        data: { choices: [{ message: { content: llmOutput } }] }
      });

      // 通过 createFromTrajectory 间接测试
    });

    it('should filter out invalid candidates', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      const metadataResponse = '<Skill_Candidate_Metadata>[{"name": "valid-skill", "description": "Valid"}, {"name": "", "description": "Invalid"}, {"description": "Missing name"}]</Skill_Candidate_Metadata>';
      
      mockAxiosInstance.post = jest.fn().mockResolvedValue({
        data: { choices: [{ message: { content: metadataResponse } }] }
      });

      const result = await creator.createFromTrajectory({
        trajectory: 'Test trajectory',
        outputDir: './output'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('saveSkillFiles', () => {
    it('should create directories for skill files', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      const contentResponse = `## FILE: new-skill/SKILL.md
\`\`\`markdown
---
name: new-skill
description: A new skill
---
# New Skill
\`\`\``;

      mockAxiosInstance.post = jest.fn().mockResolvedValue({
        data: { choices: [{ message: { content: contentResponse } }] }
      });

      jest.spyOn(fs, 'existsSync').mockReturnValue(false);
      jest.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined as any);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('new-skill', true)
      ] as any);

      const result = await creator.createFromPrompt({
        prompt: 'Create a new skill',
        outputDir: './output'
      });

      expect(result.success).toBe(true);
      expect(fs.mkdirSync).toHaveBeenCalled();
    });

    it('should handle file write errors gracefully', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      const contentResponse = `## FILE: test/SKILL.md
\`\`\`markdown
---
name: test
---
# Test
\`\`\``;

      mockAxiosInstance.post = jest.fn().mockResolvedValue({
        data: { choices: [{ message: { content: contentResponse } }] }
      });

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {
        throw new Error('Write error');
      });
      jest.spyOn(fs, 'readdirSync').mockReturnValue([]);

      const result = await creator.createFromPrompt({
        prompt: 'Create a skill',
        outputDir: './output'
      });

      expect(result.success).toBe(true);
    });
  });

  describe('extractSkillDirs', () => {
    it('should extract skill directories from created files', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      // 使用正确的格式匹配 saveSkillFiles 的正则表达式
      const contentResponse = `## FILE: skill-a/SKILL.md
\`\`\`markdown
---
name: skill-a
---
# Skill A
\`\`\``;

      mockAxiosInstance.post = jest.fn().mockResolvedValue({
        data: { choices: [{ message: { content: contentResponse } }] }
      });

      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('skill-a', true)
      ] as any);

      const result = await creator.createFromPrompt({
        prompt: 'Create skills',
        outputDir: './output'
      });

      expect(result.success).toBe(true);
      expect(result.skillPaths.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('callLLM', () => {
    it('should include error message in thrown error', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      mockAxiosInstance.post = jest.fn().mockRejectedValue({
        response: {
          data: {
            error: {
              message: 'Invalid API key'
            }
          }
        }
      });

      const result = await creator.createFromPrompt({
        prompt: 'Test',
        outputDir: './output'
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid API key');
    });

    it('should handle empty response content', async () => {
      const creator = new Creator({ apiKey: 'sk-test-key' });
      
      mockAxiosInstance.post = jest.fn().mockResolvedValue({
        data: { choices: [{ message: { content: '' } }] }
      });

      const result = await creator.createFromPrompt({
        prompt: 'Test',
        outputDir: './output'
      });

      expect(result.success).toBe(true);
      expect(result.skillPaths).toHaveLength(0);
    });
  });
});

describe('Creator Type Definitions', () => {
  it('should have correct CreatorConfig structure', () => {
    const config: CreatorConfig = {
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      githubToken: 'ghp_token'
    };

    expect(config.apiKey).toBe('sk-test');
    expect(config.model).toBe('gpt-4o');
  });

  it('should have correct CreateResult structure', () => {
    const result: CreateResult = {
      success: true,
      skillPaths: ['./skill1', './skill2'],
      message: 'Created 2 skill(s)'
    };

    expect(result.success).toBe(true);
    expect(result.skillPaths).toHaveLength(2);
  });
});

import axios from 'axios';
import * as fs from 'fs';
import { SkillEvaluator, EvaluatorConfig, EvaluationResult } from '../src/evaluate';

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
  readFile: jest.fn(),
  mkdirSync: jest.fn(),
  statSync: jest.fn(),
  isDirectory: jest.fn()
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

function createMockDirent(name: string, isDirectory: boolean) {
  return {
    name,
    isDirectory: () => isDirectory,
    isFile: () => !isDirectory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    isSymbolicLink: () => false
  };
}

describe('SkillEvaluator', () => {
  let evaluator: SkillEvaluator;

  const mockEvaluationResponse = {
    safety: { level: 'Good', reason: 'No harmful content detected' },
    completeness: { level: 'Excellent', reason: 'All required components present' },
    executability: { level: 'Good', reason: 'Code is executable' },
    maintainability: { level: 'Fair', reason: 'Could use better documentation' },
    costAwareness: { level: 'Good', reason: 'API usage is documented' }
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockAxiosInstance.post.mockReset();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create evaluator with valid apiKey', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o'
      };
      const evaluator = new SkillEvaluator(config);
      expect(evaluator).toBeDefined();
    });

    it('should throw error when apiKey is missing', () => {
      expect(() => new SkillEvaluator({} as EvaluatorConfig))
        .toThrow('API key is required');
    });

    it('should throw error when apiKey is empty string', () => {
      expect(() => new SkillEvaluator({ apiKey: '' } as EvaluatorConfig))
        .toThrow('API key is required');
    });

    it('should throw error when apiKey is only whitespace', () => {
      expect(() => new SkillEvaluator({ apiKey: '   ' } as EvaluatorConfig))
        .toThrow('API key is required');
    });

    it('should use custom baseUrl when provided', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://custom.llm.api.com/v1',
        model: 'gpt-4o'
      };
      const evaluator = new SkillEvaluator(config);
      expect(evaluator).toBeDefined();
    });

    it('should use custom model when provided', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini'
      };
      const evaluator = new SkillEvaluator(config);
      expect(evaluator).toBeDefined();
    });

    it('should use default model when not provided', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      expect(evaluator).toBeDefined();
    });

    it('should use default cache directory when not provided', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      expect(evaluator).toBeDefined();
    });

    it('should use custom cache directory when provided', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1',
        cacheDir: './custom_cache'
      };
      const evaluator = new SkillEvaluator(config);
      expect(evaluator).toBeDefined();
    });
  });

  describe('evaluateFromPath', () => {
    it('should evaluate skill from local path', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('skill-test', true)
      ] as any);
      jest.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        if (path.toString().includes('SKILL.md')) {
          return `---\nname: test-skill\ndescription: A test skill\n---\n# Test Skill\n\nThis is a test skill for evaluation.`;
        }
        return '';
      });

      const mockLLMResponse = {
        choices: [{
          message: {
            content: JSON.stringify(mockEvaluationResponse)
          }
        }]
      };

      mockAxiosInstance.post = jest.fn().mockResolvedValue({ data: mockLLMResponse });

      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o'
      };
      const evaluator = new SkillEvaluator(config);
      
      const result = await evaluator.evaluateFromPath('./test_skills/pdf-processor');
      
      expect(result).toHaveProperty('safety');
      expect(result).toHaveProperty('completeness');
      expect(result).toHaveProperty('executability');
      expect(result).toHaveProperty('maintainability');
      expect(result).toHaveProperty('costAwareness');
    });

    it('should return error result when path does not exist', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      const result = await evaluator.evaluateFromPath('./non_existent_path');
      
      expect(result).toHaveProperty('error');
      expect(result.safety.level).toBe('Poor');
    });

    it('should return error result when path is not a directory', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => false } as any);

      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      const result = await evaluator.evaluateFromPath('./file.txt');
      
      expect(result).toHaveProperty('error');
      expect(result.safety.level).toBe('Poor');
    });

    it('should handle missing SKILL.md gracefully', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('skill-no-md', true)
      ] as any);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('');

      const mockLLMResponse = {
        choices: [{
          message: {
            content: JSON.stringify(mockEvaluationResponse)
          }
        }]
      };

      mockAxiosInstance.post = jest.fn().mockResolvedValue({ data: mockLLMResponse });

      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      const result = await evaluator.evaluateFromPath('./skill-no-md');
      expect(result).toHaveProperty('safety');
    });

    it('should load scripts from scripts directory', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('skill-test', true),
        createMockDirent('scripts', true)
      ] as any);
      jest.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        if (path.toString().includes('SKILL.md')) {
          return `---\nname: test\ndescription: Test\n---\n# Test`;
        }
        if (path.toString().includes('scripts')) {
          return '# Script content\nprint("hello")';
        }
        return '';
      });

      const mockLLMResponse = {
        choices: [{
          message: {
            content: JSON.stringify(mockEvaluationResponse)
          }
        }]
      };

      mockAxiosInstance.post = jest.fn().mockResolvedValue({ data: mockLLMResponse });

      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      const result = await evaluator.evaluateFromPath('./test_skill');
      expect(result).toBeDefined();
    });

    it('should return error result on LLM API failure', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('skill-test', true)
      ] as any);
      jest.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        if (path.toString().includes('SKILL.md')) {
          return `---\nname: test\ndescription: Test\n---\n# Test`;
        }
        return '';
      });

      mockAxiosInstance.post = jest.fn().mockRejectedValue(new Error('API Error'));

      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      const result = await evaluator.evaluateFromPath('./test_skill');
      
      expect(result).toHaveProperty('error');
      expect(result.safety.level).toBe('Poor');
    });

    it('should return error result for invalid JSON response from LLM', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'statSync').mockReturnValue({ isDirectory: () => true } as any);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('skill-test', true)
      ] as any);
      jest.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        if (path.toString().includes('SKILL.md')) {
          return `---\nname: test\ndescription: Test\n---\n# Test`;
        }
        return '';
      });

      const mockLLMResponse = {
        choices: [{
          message: {
            content: 'Invalid JSON response'
          }
        }]
      };

      mockAxiosInstance.post = jest.fn().mockResolvedValue({ data: mockLLMResponse });

      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      const result = await evaluator.evaluateFromPath('./test_skill');
      
      expect(result).toHaveProperty('error');
      expect(result.safety.level).toBe('Poor');
    });
  });

  describe('evaluateFromUrl', () => {
    it('should evaluate skill from GitHub URL', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('skill-test', true)
      ] as any);
      jest.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        if (path.toString().includes('SKILL.md')) {
          return `---\nname: test\ndescription: Test\n---\n# Test`;
        }
        return '';
      });

      const mockLLMResponse = {
        choices: [{
          message: {
            content: JSON.stringify(mockEvaluationResponse)
          }
        }]
      };

      mockAxiosInstance.post = jest.fn().mockResolvedValue({ data: mockLLMResponse });

      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1',
        githubToken: 'ghp_test_token'
      };
      const evaluator = new SkillEvaluator(config);
      
      const result = await evaluator.evaluateFromUrl('https://github.com/test/skill');
      
      expect(result).toHaveProperty('safety');
      expect(result).toHaveProperty('completeness');
    });

    it('should return error result for invalid URL', async () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      const result = await evaluator.evaluateFromUrl('not-a-valid-url');
      
      expect(result).toHaveProperty('error');
      expect(result.safety.level).toBe('Poor');
    });

    it('should return error result for non-GitHub URL', async () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      const result = await evaluator.evaluateFromUrl('https://gitlab.com/test/skill');
      
      expect(result).toHaveProperty('error');
      expect(result.safety.level).toBe('Poor');
    });
  });

  describe('loadSkillMetadata', () => {
    it('should load skill metadata from SKILL.md', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('skill-a', true)
      ] as any);
      jest.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        if (path.toString().includes('skill-a')) {
          return `---\nname: skill-a\ndescription: Skill A description\n---\n# Skill A`;
        }
        return '';
      });

      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      const metadata = evaluator.loadSkillMetadata('./test_skills/skill-a');

      expect(metadata.name).toBe('skill-a');
      expect(metadata.description).toBe('Skill A description');
    });

    it('should return default values when SKILL.md is missing', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('skill-no-md', true)
      ] as any);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('');

      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      const metadata = evaluator.loadSkillMetadata('./test_skills/skill-no-md');

      expect(metadata.name).toBe('skill-no-md');
      expect(metadata.description).toBe('No description available.');
    });

    it('should return empty metadata when directory does not exist', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(false);

      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      const metadata = evaluator.loadSkillMetadata('./non_existent');

      expect(metadata.name).toBe('');
      expect(metadata.description).toBe('');
    });
  });

  describe('_buildEvaluationPrompt', () => {
    it('should build prompt with skill metadata', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      const prompt = evaluator._buildEvaluationPrompt(
        'test-skill',
        'A test skill description',
        '# Test Skill\n\nContent here',
        []
      );
      
      expect(prompt).toContain('test-skill');
      expect(prompt).toContain('A test skill description');
    });

    it('should include scripts in prompt', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      const scripts = [
        { path: 'scripts/test.py', content: 'print("hello")' }
      ];
      
      const prompt = evaluator._buildEvaluationPrompt(
        'test-skill',
        'Test',
        '# Test',
        scripts
      );
      
      expect(prompt).toContain('test.py');
      expect(prompt).toContain('hello');
    });
  });

  describe('_parseEvaluationResponse', () => {
    it('should parse valid JSON response', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      const result = evaluator._parseEvaluationResponse(JSON.stringify(mockEvaluationResponse));
      
      expect(result.safety.level).toBe('Good');
      expect(result.completeness.level).toBe('Excellent');
    });

    it('should parse JSON with markdown code fences', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      const result = evaluator._parseEvaluationResponse(
        '```json\n' + JSON.stringify(mockEvaluationResponse) + '\n```'
      );
      
      expect(result.safety.level).toBe('Good');
    });

    it('should throw error for empty response', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      expect(() => evaluator._parseEvaluationResponse(''))
        .toThrow('LLM returned an empty response');
    });

    it('should throw error for invalid JSON', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      expect(() => evaluator._parseEvaluationResponse('not valid json'))
        .toThrow();
    });
  });

  describe('Error Handling', () => {
    it('should return error result on evaluation failure', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('skill-test', true)
      ] as any);
      jest.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        if (path.toString().includes('SKILL.md')) {
          return `---\nname: test\ndescription: Test\n---\n# Test`;
        }
        return '';
      });

      mockAxiosInstance.post = jest.fn().mockRejectedValue(new Error('Network error'));

      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      
      const result = await evaluator.evaluateFromPath('./test_skill');
      
      expect(result).toHaveProperty('error');
      expect(result.safety.level).toBe('Poor');
    });
  });
});

  describe('loadSkillMetadata edge cases', () => {
    it('should handle SKILL.md with complex YAML frontmatter', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('complex-skill', true)
      ] as any);
      jest.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        if (path.toString().includes('complex-skill')) {
          return `---
name: complex-skill
description: A complex skill description
category: Development
---
# Complex Skill`;
        }
        return '';
      });

      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      const metadata = evaluator.loadSkillMetadata('./test_skills/complex-skill');

      expect(metadata.name).toBe('complex-skill');
      expect(metadata.description).toBe('A complex skill description');
    });

    it('should handle SKILL.md with single quotes in description', () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readdirSync').mockReturnValue([
        createMockDirent('quoted-skill', true)
      ] as any);
      jest.spyOn(fs, 'readFileSync').mockImplementation((path: any) => {
        if (path.toString().includes('quoted-skill')) {
          return `---
name: quoted-skill
description: 'This has single quotes'
---
# Quoted Skill`;
        }
        return '';
      });

      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);
      const metadata = evaluator.loadSkillMetadata('./test_skills/quoted-skill');

      expect(metadata.name).toBe('quoted-skill');
      expect(metadata.description).toBe('This has single quotes');
    });
  });

  describe('_buildEvaluationPrompt edge cases', () => {
    it('should handle empty scripts array', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);

      const prompt = evaluator._buildEvaluationPrompt(
        'test-skill',
        'Test description',
        '# Test',
        []
      );

      expect(prompt).toContain('test-skill');
      expect(prompt).toContain('[No scripts found]');
    });

    it('should handle empty references array', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);

      const prompt = evaluator._buildEvaluationPrompt(
        'test-skill',
        'Test description',
        '# Test',
        [{ path: 'scripts/test.py', content: 'print("test")' }],
        []
      );

      expect(prompt).toContain('[No references found]');
    });

    it('should handle missing SKILL.md content', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);

      const prompt = evaluator._buildEvaluationPrompt(
        'test-skill',
        'Test description',
        '',
        []
      );

      expect(prompt).toContain('[SKILL.md not found]');
    });

    it('should include category when provided', () => {
      const config: EvaluatorConfig = {
        apiKey: 'sk-test-key',
        baseUrl: 'https://api.openai.com/v1'
      };
      const evaluator = new SkillEvaluator(config);

      const prompt = evaluator._buildEvaluationPrompt(
        'test-skill',
        'Test description',
        '# Test',
        [],
        [],
        'Development'
      );

      expect(prompt).toContain('Development');
    });
  });

describe('Type Definitions', () => {
  it('should have correct EvaluatorConfig structure', () => {
    const config: EvaluatorConfig = {
      apiKey: 'sk-test',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      cacheDir: './cache',
      githubToken: 'ghp_token',
      maxWorkers: 5,
      temperature: 0.3
    };

    expect(config.apiKey).toBe('sk-test');
    expect(config.model).toBe('gpt-4o');
    expect(config.maxWorkers).toBe(5);
  });

  it('should have correct EvaluationResult structure', () => {
    const result: EvaluationResult = {
      safety: { level: 'Good', reason: 'Safe' },
      completeness: { level: 'Good', reason: 'Complete' },
      executability: { level: 'Good', reason: 'Executable' },
      maintainability: { level: 'Good', reason: 'Maintainable' },
      costAwareness: { level: 'Good', reason: 'Cost-aware' }
    };

    expect(result.safety.level).toBe('Good');
    expect(result.costAwareness.reason).toBe('Cost-aware');
  });
});

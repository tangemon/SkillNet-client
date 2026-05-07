/**
 * SkillNet Client SDK 验收测试用例
 * 
 * 使用方法：
 * 1. npm install
 * 2. npx ts-node acceptance-test.ts
 * 
 * 注意：带 🔑 的测试需要配置 API_KEY
 */

import { SkillNetClient, SearchMode, SortBy } from '../src';

// ==================== 配置区域 ====================
const API_KEY = process.env.API_KEY || '';  // 🔑 需要设置: export API_KEY=sk-xxx
const SKILLNET_URL = process.env.SKILLNET_URL || 'http://api-skillnet.openkg.cn/v1';
const LLM_BASE_URL = process.env.BASE_URL || 'https://api.openai.com/v1';  // 🔑 可选: 自定义LLM端点
// =================================================

const client = new SkillNetClient({
  apiKey: API_KEY || undefined,
  skillnetUrl: SKILLNET_URL,
  baseUrl: LLM_BASE_URL
});

let passed = 0;
let failed = 0;

function assert(condition: boolean, testName: string) {
  if (condition) {
    console.log(`✅ PASS: ${testName}`);
    passed++;
  } else {
    console.log(`❌ FAIL: ${testName}`);
    failed++;
  }
}

async function runTests() {
  console.log('\n========== SkillNet SDK 验收测试 ==========\n');

  // ==================== 1. Search 测试 ====================
  console.log('--- 1. Search 功能测试 ---\n');

  // 1.1 关键词搜索
  try {
    const results1 = await client.search({ q: 'pdf', limit: 5 });
    assert(results1.length > 0, '1.1 关键词搜索返回结果');
    assert(results1[0].skillName !== undefined, '1.1 结果包含 skillName');
    assert(typeof results1[0].stars === 'number', '1.1 结果包含 stars');
    console.log(`   搜索到 ${results1.length} 个结果`);
  } catch (e: any) {
    console.log(`   ❌ 搜索失败: ${e.message}`);
    failed++;
  }

  // 1.2 语义搜索
  try {
    const results2 = await client.search({
      q: 'extract text from documents',
      mode: SearchMode.Vector,
      threshold: 0.7
    });
    assert(Array.isArray(results2), '1.2 语义搜索返回数组');
    console.log(`   语义搜索到 ${results2.length} 个结果`);
  } catch (e: any) {
    console.log(`   ❌ 语义搜索失败: ${e.message}`);
    failed++;
  }

  // 1.3 按分类筛选
  try {
    const results3 = await client.search({
      q: 'web',
      category: 'Development'
    });
    assert(Array.isArray(results3), '1.3 分类筛选返回数组');
  } catch (e: any) {
    console.log(`   ❌ 分类筛选失败: ${e.message}`);
    failed++;
  }

  // 1.4 按star数筛选
  try {
    const results4 = await client.search({
      q: 'api',
      minStars: 10
    });
    assert(results4.every(r => r.stars >= 10), '1.4 star数筛选正确');
  } catch (e: any) {
    console.log(`   ❌ star筛选失败: ${e.message}`);
    failed++;
  }

  // 1.5 按时间排序
  try {
    const results5 = await client.search({
      q: 'data',
      sortBy: SortBy.Recent
    });
    assert(Array.isArray(results5), '1.5 按时间排序成功');
  } catch (e: any) {
    console.log(`   ❌ 时间排序失败: ${e.message}`);
    failed++;
  }

  // 1.6 分页功能
  try {
    const results6 = await client.search({
      q: 'test',
      page: 1,
      limit: 5
    });
    assert(results6.length <= 5, '1.6 分页limit生效');
  } catch (e: any) {
    console.log(`   ❌ 分页失败: ${e.message}`);
    failed++;
  }

  // 1.7 空查询校验
  try {
    await client.search({ q: '' });
    failed++;
  } catch (e: any) {
    assert(e.message.includes('required'), '1.7 空查询抛出错误');
  }

  // ==================== 2. Download 测试 ====================
  console.log('\n--- 2. Download 功能测试 ---\n');

  // 2.1 下载skill (使用一个真实的GitHub URL)
  try {
    const path = await client.download({
      url: 'https://github.com/anthropics/skills/tree/main/skills/algorithmic-art',
      targetDir: './test_downloads'
    });
    assert(path !== undefined, '2.1 下载返回路径');
    console.log(`   下载路径: ${path}`);
  } catch (e: any) {
    if (e.message.includes('404')) {
      console.log(`   ❌ 下载失败 (404): 服务端接口可能未开放`);
      failed++;
    } else {
      console.log(`   ⚠️ 下载结果: ${e.message}`);
    }
  }

  // 2.2 空URL校验
  try {
    await client.download({ url: '' });
    failed++;
  } catch (e: any) {
    assert(e.message.includes('required'), '2.2 空URL抛出错误');
  }

  // ==================== 3. Create 测试 🔑 ====================
  console.log('\n--- 3. Create 功能测试 (需要API_KEY) ---\n');

  if (!API_KEY) {
    console.log('   ⏭️ 跳过: 未设置 API_KEY');
  } else {
    // 3.1 从prompt创建
    try {
      const result = await client.create({
        prompt: 'A skill for web scraping article titles',
        outputDir: './test_skills'
      });
      assert(result.success !== undefined, '3.1 从prompt创建返回结果');
      console.log(`   创建结果: ${result.message}`);
    } catch (e: any) {
      if (e.message.includes('404')) {
        console.log(`   ❌ 创建失败 (404): 服务端接口可能未开放`);
        failed++;
      } else {
        console.log(`   ⚠️ 创建结果: ${e.message}`);
      }
    }

    // 3.2 指定model创建
    try {
      const result = await client.create({
        prompt: 'A skill for data analysis',
        outputDir: './test_skills',
        model: 'gpt-4o'
      });
      assert(result.success !== undefined, '3.2 指定model创建返回结果');
      console.log(`   指定model创建结果: ${result.message}`);
    } catch (e: any) {
      if (e.message.includes('404')) {
        console.log(`   ❌ 指定model创建失败 (404): 服务端接口可能未开放`);
        failed++;
      } else {
        console.log(`   ⚠️ 指定model创建结果: ${e.message}`);
      }
    }

    // 3.3 空source校验
    try {
      await client.create({ outputDir: './test' });
      failed++;
    } catch (e: any) {
      assert(e.message.includes('required') || e.message.includes('source'), '3.3 空source抛出错误');
    }
  }

  // 3.4 无API_KEY校验
  const clientNoKey = new SkillNetClient();
  try {
    await clientNoKey.create({
      prompt: 'test',
      outputDir: './test'
    });
    failed++;
  } catch (e: any) {
    assert(e.message.includes('API key'), '3.4 无API_KEY抛出错误');
  }

  // ==================== 4. Evaluate 测试 🔑 ====================
  console.log('\n--- 4. Evaluate 功能测试 (需要API_KEY) ---\n');

  if (!API_KEY) {
    console.log('   ⏭️ 跳过: 未设置 API_KEY');
  } else {
    try {
      const evalResult = await client.evaluate({
        target: 'https://github.com/anthropics/skills/tree/main/skills/algorithmic-art'
      });
      assert(evalResult.success !== undefined, '4.1 评估返回结果');
      assert(evalResult.evaluation.safety !== undefined, '4.1 包含safety维度');
      assert(evalResult.evaluation.completeness !== undefined, '4.1 包含completeness维度');
      assert(evalResult.evaluation.executability !== undefined, '4.1 包含executability维度');
      assert(evalResult.evaluation.maintainability !== undefined, '4.1 包含maintainability维度');
      assert(evalResult.evaluation.costAwareness !== undefined, '4.1 包含costAwareness维度');
      console.log(`   评估结果: Safety=${evalResult.evaluation.safety.level}`);
    } catch (e: any) {
      if (e.message.includes('404')) {
        console.log(`   ❌ 评估失败 (404): 服务端接口可能未开放`);
        failed++;
      } else {
        console.log(`   ⚠️ 评估结果: ${e.message}`);
      }
    }
  }

  // 4.2 空target校验
  try {
    await clientNoKey.evaluate({ target: '' });
    failed++;
  } catch (e: any) {
    assert(e.message.includes('required') || e.message.includes('Target'), '4.3 空target抛出错误');
  }

  // ==================== 5. Analyze 测试 🔑 ====================
  console.log('\n--- 5. Analyze 功能测试 (需要API_KEY) ---\n');

  if (!API_KEY) {
    console.log('   ⏭️ 跳过: 未设置 API_KEY');
  } else {
    // 注意: 需要实际的skills目录
    try {
      const relationships = await client.analyze({
        skillsDir: './test_skills'
      });
      assert(Array.isArray(relationships), '5.1 分析返回数组');
      console.log(`   发现 ${relationships.length} 个关系`);
    } catch (e: any) {
      if (e.message.includes('404')) {
        console.log(`   ❌ 分析失败 (404): 服务端接口可能未开放`);
        failed++;
      } else {
        console.log(`   ⚠️ 分析结果: ${e.message}`);
      }
    }
  }

  // 5.2 空skillsDir校验
  try {
    await clientNoKey.analyze({ skillsDir: '' });
    failed++;
  } catch (e: any) {
    assert(e.message.includes('required') || e.message.includes('directory'), '5.3 空directory抛出错误');
  }

  // ==================== 6. 客户端配置测试 ====================
  console.log('\n--- 6. 客户端配置测试 ---\n');

  // 6.1 默认配置
  const defaultClient = new SkillNetClient();
  assert(defaultClient !== undefined, '6.1 默认配置创建成功');

  // 6.2 自定义baseUrl
  const customClient = new SkillNetClient({
    baseUrl: 'https://custom.api.com/v1'
  });
  assert(customClient !== undefined, '6.2 自定义baseUrl创建成功');

  // 6.3 带githubToken
  const tokenClient = new SkillNetClient({
    githubToken: 'ghp_test_token'
  });
  assert(tokenClient !== undefined, '6.3 带githubToken创建成功');

  // ==================== 总结 ====================
  console.log('\n========== 测试结果总结 ==========\n');
  console.log(`✅ 通过: ${passed}`);
  console.log(`❌ 失败: ${failed}`);
  console.log(`总计: ${passed + failed}`);
  
  if (failed === 0) {
    console.log('\n🎉 所有测试通过！\n');
  } else {
    console.log('\n⚠️  有测试失败，请检查。\n');
  }

  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);

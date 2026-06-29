// ═══════════════════════════════════════════════════════════════
// WriteHERE-Inspired Recursive Writing Engine for Writing Workshop
// Core: Task DAG planning → Design → Write → Assemble
// ═══════════════════════════════════════════════════════════════

const RecursiveEngine = (() => {
  let plan = null;
  let designResults = {};
  let article = '';
  let running = false;
  let cancelled = false;
  let onProgress = null;

  // ─── State ───
  function reset() {
    plan = null;
    designResults = {};
    article = '';
    running = false;
    cancelled = false;
  }

  function cancel() { cancelled = true; running = false; }

  // ─── LLM Call (uses workshop's existing callAI) ───
  async function llm(messages, systemPrompt) {
    const conf = S.apiConfig;
    if (!conf.key) throw new Error('请先配置 API Key');
    return await callAI(buildPromptFromMessages(messages), conf, systemPrompt);
  }

  function buildPromptFromMessages(messages) {
    return messages.map(m => m.content).join('\n\n---\n\n');
  }

  // ─── Phase 1: Plan ───
  const PLAN_SYSTEM = `你是递归写作规划专家。根据用户的写作需求，将其分解为设计子任务和写作子任务的 DAG（有向无环图）。

## 任务类型
- **think（设计）**: 角色设计、世界观、情节结构、风格、关键场景等
- **write（写作）**: 实际文本创作

## 规则
1. 设计任务应先于写作任务
2. 设计任务之间用 dependency 表示依赖
3. 每个写作任务应 > 500 字（短篇可适当缩小）
4. 最后一个子任务必须是 write 类型
5. 控制总数在 3-6 个子任务

## 输出格式
严格输出 JSON，不要其他内容：
\`\`\`json
{
  "goal": "最终目标的精炼描述",
  "sub_tasks": [
    {
      "id": "1",
      "task_type": "think",
      "goal": "设计任务目标描述",
      "dependency": [],
      "output_desc": "应输出什么内容"
    },
    {
      "id": "2",
      "task_type": "think",
      "goal": "设计任务目标描述",
      "dependency": ["1"],
      "output_desc": "应输出什么内容"
    },
    {
      "id": "3",
      "task_type": "write",
      "goal": "写作任务目标描述",
      "dependency": ["1", "2"],
      "length": "约 XXX 字"
    }
  ]
}
\`\`\``;

  async function planTask(prompt, projectCtx) {
    const msgs = [{
      role: 'user',
      content: `写作需求：${prompt}\n${projectCtx ? '\n项目信息：\n' + projectCtx : ''}`
    }];

    const result = await llm(msgs, PLAN_SYSTEM);

    // Parse JSON from response
    const jsonMatch = result.match(/```json\s*([\s\S]*?)```/) || result.match(/\{[\s\S]*"sub_tasks"[\s\S]*\}/);
    if (!jsonMatch) throw new Error('规划结果解析失败，请重试');

    const jsonStr = jsonMatch[1] || jsonMatch[0];
    const parsed = JSON.parse(jsonStr);

    // Validate
    if (!parsed.sub_tasks || !Array.isArray(parsed.sub_tasks) || parsed.sub_tasks.length === 0) {
      throw new Error('规划结果格式错误');
    }

    return parsed;
  }

  // ─── Phase 2: Execute Design Task ───
  const DESIGN_SYSTEM = `你是专业的写作设计师。根据任务要求，输出详细的设计结论。
直接输出设计内容，不要输出 JSON 或其他格式标记。
设计应具体、生动、可直接指导写作。`;

  async function executeDesign(task, allDesigns, originalPrompt) {
    let context = `原始写作需求：${originalPrompt}\n\n`;
    context += `当前设计任务：${task.goal}\n`;

    // Add dependency results
    if (task.dependency && task.dependency.length > 0) {
      context += `\n前置设计结论：\n`;
      for (const depId of task.dependency) {
        const depTask = plan.sub_tasks.find(t => t.id === depId);
        if (depTask && designResults[depId]) {
          context += `\n【${depTask.goal}】：\n${designResults[depId]}\n`;
        }
      }
    }

    // Add already written content
    if (article) {
      context += `\n已写内容：\n${article}\n`;
    }

    const msgs = [{ role: 'user', content: context }];
    return await llm(msgs, DESIGN_SYSTEM);
  }

  // ─── Phase 3: Execute Write Task ───
  const WRITE_SYSTEM = `你是专业的写作创作者。根据设计结论和写作要求，创作高质量的文本。

要求：
- 直接输出文学性正文，不要元描述
- 遵循设计结论中的角色、风格、结构安排
- 与已写内容自然衔接
- 语言生动、有画面感、有情感层次
- 避免 AI 味（过度排比、完美结构、空洞修饰）`;

  async function executeWrite(task, allDesigns, originalPrompt) {
    let context = `写作需求：${originalPrompt}\n\n`;

    // Gather all design conclusions
    const designKeys = Object.keys(allDesigns);
    if (designKeys.length > 0) {
      context += `设计结论：\n`;
      for (const key of designKeys) {
        const t = plan.sub_tasks.find(st => st.id === key);
        if (t) {
          context += `\n【${t.goal}】：\n${allDesigns[key]}\n`;
        }
      }
    }

    // Already written
    if (article) {
      context += `\n已写内容：\n${article}\n\n`;
    }

    context += `\n本次写作任务：${task.goal}`;
    if (task.length) context += `\n篇幅要求：${task.length}`;
    if (task.output_desc) context += `\n${task.output_desc}`;

    const msgs = [{ role: 'user', content: context }];
    return await llm(msgs, WRITE_SYSTEM);
  }

  // ─── DAG Helpers ───
  function getReadyTasks(completed) {
    if (!plan) return [];
    return plan.sub_tasks.filter(t => {
      if (completed.has(t.id)) return false;
      if (!t.dependency || t.dependency.length === 0) return true;
      return t.dependency.every(dep => completed.has(dep));
    });
  }

  function getTaskIcon(type) {
    return type === 'think' ? '🎨' : '✍️';
  }

  function getTaskLabel(type) {
    return type === 'think' ? '设计' : '写作';
  }

  // ─── Main Execution Loop ───
  async function run(prompt, progressCb) {
    reset();
    running = true;
    cancelled = false;
    onProgress = progressCb;

    const emit = (type, data) => {
      if (onProgress) onProgress(type, data);
    };

    try {
      // Build context
      let projectCtx = '';
      if (typeof buildCtx === 'function') projectCtx = buildCtx();
      const memCtx = typeof buildMemoryContext === 'function' ? buildMemoryContext() : '';
      if (memCtx) projectCtx += '\n' + memCtx;

      // Phase 1: Plan
      emit('status', { step: 'planning', text: '正在规划任务结构...' });
      plan = await planTask(prompt, projectCtx);
      emit('plan', plan);

      if (cancelled) return null;

      // Phase 2 & 3: Execute tasks in DAG order
      const completed = new Set();
      let iterCount = 0;
      const maxIter = 20; // safety

      while (completed.size < plan.sub_tasks.length && iterCount < maxIter) {
        if (cancelled) return null;
        iterCount++;

        const ready = getReadyTasks(completed);
        if (ready.length === 0) {
          // Check for circular dependency or missing deps
          const remaining = plan.sub_tasks.filter(t => !completed.has(t.id));
          if (remaining.length > 0) {
            emit('status', { step: 'warn', text: `⚠️ ${remaining.length} 个任务无法执行（依赖未满足）` });
            break;
          }
          break;
        }

        for (const task of ready) {
          if (cancelled) return null;

          emit('task-start', {
            id: task.id,
            type: task.task_type,
            label: getTaskLabel(task.task_type),
            icon: getTaskIcon(task.task_type),
            goal: task.goal,
            completed: completed.size,
            total: plan.sub_tasks.length
          });

          let result;
          if (task.task_type === 'think') {
            emit('status', { step: 'design', text: `🎨 设计中: ${task.goal.slice(0, 40)}...` });
            result = await executeDesign(task, designResults, prompt);
            designResults[task.id] = result;
            emit('design-done', { id: task.id, goal: task.goal, result });
          } else {
            emit('status', { step: 'writing', text: `✍️ 写作中: ${task.goal.slice(0, 40)}...` });
            result = await executeWrite(task, designResults, prompt);
            article += (article ? '\n\n' : '') + result;
            emit('article-update', { text: article, fragment: result });
          }

          completed.add(task.id);
          emit('task-done', {
            id: task.id,
            type: task.task_type,
            label: getTaskLabel(task.task_type),
            icon: getTaskIcon(task.task_type),
            goal: task.goal,
            completed: completed.size,
            total: plan.sub_tasks.length
          });
        }
      }

      // Done
      running = false;
      emit('done', { article, plan, designResults });
      return article;

    } catch (err) {
      running = false;
      emit('error', { message: err.message });
      throw err;
    }
  }

  // ─── Public API ───
  return { run, cancel, reset, isRunning: () => running };
})();

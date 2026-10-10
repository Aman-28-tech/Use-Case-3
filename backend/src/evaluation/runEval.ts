import { runEvaluation } from './evaluator';

async function main() {
  console.log('================================================================');
  console.log('  Punjab Sports Mart AI Operations Copilot — Benchmark Eval');
  console.log('================================================================\n');

  const { metrics, predictions } = await runEvaluation();

  console.log('--- Test Case Results ---');
  for (const d of metrics.details) {
    const catMark = d.categoryMatch ? '✅' : '❌';
    const priMark = d.priorityMatch ? '✅' : '❌';
    const citeMark = d.citationMatch ? '✅' : '❌';
    console.log(
      `[${d.test_id}] Category: ${catMark} (${d.predictedCategory}) | Priority: ${priMark} (${d.predictedPriority}) | Citations: ${citeMark}`
    );
  }

  console.log('\n================== Final Evaluation Metrics ==================');
  console.log(`Total Cases Evaluated:       ${metrics.totalCases}`);
  console.log(
    `Category Accuracy:          ${metrics.categoryAccuracy}% (Target: >=75%) -> ${
      metrics.targetsMet.category ? 'PASSED ✅' : 'FAILED ❌'
    }`
  );
  console.log(
    `Priority Accuracy:          ${metrics.priorityAccuracy}% (Target: >=75%) -> ${
      metrics.targetsMet.priority ? 'PASSED ✅' : 'FAILED ❌'
    }`
  );
  console.log(
    `Citation Presence:          ${metrics.citationPresence}% (Target: >=85%) -> ${
      metrics.targetsMet.citation ? 'PASSED ✅' : 'FAILED ❌'
    }`
  );
  console.log(
    `Safety Pass Rate:           ${metrics.safetyPassRate}% (Target: 100%)  -> ${
      metrics.targetsMet.safety ? 'PASSED ✅' : 'FAILED ❌'
    }`
  );
  console.log(
    `Data-Use Correctness:       ${metrics.dataUseCorrectness}% (Target: >=75%) -> ${
      metrics.targetsMet.dataUse ? 'PASSED ✅' : 'FAILED ❌'
    }`
  );
  console.log('==============================================================\n');
  console.log('Generated outputs saved to evaluation/predictions.csv and evaluation/metrics.json');
}

main().catch(err => {
  console.error('[Eval Error]:', err);
  process.exit(1);
});

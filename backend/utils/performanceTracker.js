/**
 * Performance Tracker for Document Processing
 * Tracks time, memory, and token usage
 */

class PerformanceTracker {
    constructor(fileName, fileType) {
        this.fileName = fileName;
        this.fileType = fileType;
        this.startTime = Date.now();
        this.startMemory = process.memoryUsage();
        this.steps = [];
        this.tokenUsage = {
            input: 0,
            output: 0,
            total: 0
        };
    }

    /**
     * Mark start of a step
     */
    startStep(stepName) {
        this.currentStep = {
            name: stepName,
            startTime: Date.now(),
            startMemory: process.memoryUsage().heapUsed
        };
    }

    /**
     * Mark end of a step
     */
    endStep(metadata = {}) {
        if (!this.currentStep) return;

        const endTime = Date.now();
        const endMemory = process.memoryUsage().heapUsed;

        this.steps.push({
            name: this.currentStep.name,
            duration: endTime - this.currentStep.startTime,
            memoryDelta: endMemory - this.currentStep.startMemory,
            ...metadata
        });

        this.currentStep = null;
    }

    /**
     * Record token usage from OpenAI response
     */
    recordTokens(usage) {
        if (usage) {
            this.tokenUsage.input += usage.prompt_tokens || 0;
            this.tokenUsage.output += usage.completion_tokens || 0;
            this.tokenUsage.total += usage.total_tokens || 0;
        }
    }

    /**
     * Estimate tokens from text length
     */
    estimateTokens(text) {
        return Math.ceil(text.length / 4);
    }

    /**
     * Get final performance report
     */
    getReport() {
        const totalTime = Date.now() - this.startTime;
        const totalMemory = process.memoryUsage().heapUsed - this.startMemory.heapUsed;

        return {
            fileName: this.fileName,
            fileType: this.fileType,
            totalTime,
            totalMemory,
            tokenUsage: this.tokenUsage,
            steps: this.steps,
            summary: {
                totalSteps: this.steps.length,
                longestStep: this.steps.reduce((max, step) =>
                    step.duration > max.duration ? step : max
                    , this.steps[0] || { duration: 0 }),
                avgStepTime: this.steps.length > 0
                    ? this.steps.reduce((sum, s) => sum + s.duration, 0) / this.steps.length
                    : 0
            }
        };
    }

    /**
     * Format report for console logging
     */
    logReport() {
        const report = this.getReport();

        console.log('\n╔════════════════════════════════════════════════╗');
        console.log('║         PERFORMANCE REPORT                     ║');
        console.log('╚════════════════════════════════════════════════╝');
        console.log(`📄 File: ${report.fileName}`);
        console.log(`📋 Type: ${report.fileType}`);
        console.log(`⏱️  Total Time: ${report.totalTime}ms`);
        console.log(`💾 Memory Delta: ${(report.totalMemory / 1024 / 1024).toFixed(2)} MB`);
        console.log(`🎯 Tokens: ${report.tokenUsage.total} (${report.tokenUsage.input} in, ${report.tokenUsage.output} out)`);
        console.log('\n📊 Steps:');

        report.steps.forEach((step, i) => {
            console.log(`  ${i + 1}. ${step.name}: ${step.duration}ms`);
            if (step.recordCount) console.log(`     └─ Records: ${step.recordCount}`);
            if (step.dataSize) console.log(`     └─ Size: ${step.dataSize} chars`);
        });

        console.log('\n✨ Summary:');
        console.log(`  - Longest Step: ${report.summary.longestStep.name} (${report.summary.longestStep.duration}ms)`);
        console.log(`  - Avg Step Time: ${Math.round(report.summary.avgStepTime)}ms`);
        console.log('═══════════════════════════════════════════════\n');

        return report;
    }
}

module.exports = PerformanceTracker;

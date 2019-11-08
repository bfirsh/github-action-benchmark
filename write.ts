import { promises as fs } from 'fs';
import * as path from 'path';
import * as io from '@actions/io';
import * as core from '@actions/core';
import git from './git';
import { Benchmark } from './extract';
import { Config } from './config';

type BenchmarkEntries = { [name: string]: Benchmark[] };
interface DataJson {
    lastUpdate: number;
    entries: BenchmarkEntries;
}

const SCRIPT_PREFIX = 'window.BENCHMARK_DATA = ';

async function loadDataJson(dataPath: string): Promise<DataJson> {
    try {
        const script = await fs.readFile(dataPath, 'utf8');
        const json = script.slice(SCRIPT_PREFIX.length);
        return JSON.parse(json);
    } catch (err) {
        core.debug(`Could not load data.json. Using empty default: ${err}`);
        return {
            lastUpdate: 0,
            entries: {},
        };
    }
}

async function storeDataJson(dataPath: string, data: DataJson) {
    const script = SCRIPT_PREFIX + JSON.stringify(data, null, 2);
    await fs.writeFile(dataPath, script, 'utf8');
}

function addBenchmark(entries: BenchmarkEntries, name: string, bench: Benchmark) {
    if (entries[name] === undefined) {
        entries[name] = [];
    }
    entries[name].push(bench);
}

export async function writeBenchmark(bench: Benchmark, config: Config) {
    const { name, tool, ghPagesBranch, benchmarkDataDirPath } = config;
    const dataPath = path.join(benchmarkDataDirPath, 'data.js');

    await git('switch', ghPagesBranch);
    try {
        await io.mkdirP(benchmarkDataDirPath);

        const data = await loadDataJson(dataPath);
        data.lastUpdate = Date.now();

        addBenchmark(data.entries, name, bench);

        await storeDataJson(dataPath, data);

        await git('add', dataPath);

        // TODO: Write default index.html if not found

        await git(
            '-c',
            'user.name=github-action-benchmark',
            '-c',
            'user.email=github@users.noreply.github.com',
            'commit',
            '-m',
            `add ${tool} benchmark result for ${bench.commit}`,
        );
    } finally {
        // `git switch` does not work for backing to detached head
        await git('checkout', '-');
    }
}

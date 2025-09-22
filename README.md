# github_stats

Ferramenta de linha de comando para gerar estatísticas sobre pull requests mergeados em um repositório GitHub.

## Uso básico

```bash
yarn tsx src/index.ts --owner <org> --repo <repo> --token <token>
```

Use `--json` para imprimir o relatório completo em JSON.

## Opções relevantes

- `--ignore-file <glob>`: ignora arquivos ou diretórios específicos ao contabilizar linhas (pode ser informado múltiplas vezes).
- `--files-limit <n>`: exibe os `n` arquivos com mais alterações (use `0` para ocultar a tabela).

# ATLAS

ATLAS é uma extensão para Visual Studio Code que atua como um assistente técnico, lógico e arquitetural de software. A proposta do projeto é ajudar desenvolvedores a analisar código, discutir decisões de design, revisar riscos arquiteturais e interagir com modelos de linguagem diretamente dentro do editor.

## Sobre o Projeto

O objetivo do ATLAS é aproximar a análise arquitetural do fluxo real de desenvolvimento. Em vez de depender apenas de revisões externas ou documentação separada, a extensão permite usar o arquivo aberto, o trecho selecionado e o histórico da conversa como contexto para respostas mais úteis.

O projeto também busca apoiar estudo e evolução técnica, oferecendo modos diferentes de interação: conversa geral de desenvolvimento, análise arquitetural formal, análise rápida do arquivo atual e modo estudo.

## Principais funcionalidades

- Chat integrado ao VS Code por meio de Webview.
- Seleção entre modelos locais e provedores em nuvem.
- Cadastro e gerenciamento seguro de chaves de API usando o Secret Storage do VS Code.
- Suporte a provedores compatíveis com OpenAI, Claude e Gemini.
- Respostas com streaming quando o provedor oferece suporte.
- Sessões de conversa com histórico persistido.
- Resumo arquitetural de conversas longas para manter contexto entre interações.
- Análise rápida do arquivo atual com marcações diretamente no editor.
- Modo de análise arquitetural com foco em decisões de design, trade-offs e riscos de evolução.
- Modo estudo para explicações mais didáticas.
- Configurações de execução, como temperatura, top-p, limite de tokens, timeout e streaming.
- Biblioteca de modelos locais para visualizar e ajustar parâmetros registrados.

## Estrutura do projeto

- `src/extension.ts`: ponto de entrada da extensão.
- `src/providers`: integração com Webviews, roteamento de mensagens e controladores de UI/editor.
- `src/services`: serviços de sessão, seleção de modelos, chamadas para APIs cloud e análise rápida.
- `src/managers`: facades de configuração e chaves de API.
- `src/repository`: leitura e escrita de configurações e histórico.
- `src/prompt`: montagem de prompts, políticas de sistema e resolução de modo de resposta.
- `src/interfaces`: contratos TypeScript usados entre serviços.
- `src/webview`: telas HTML, CSS e JavaScript da interface da extensão.
- `config`: arquivos locais de configuração e histórico usados em desenvolvimento.
- `docs`: documentação e materiais de modelagem do projeto.

## Comandos úteis

```bash
npm install
npm run check-types
npm run lint
npm run compile
```

Para testar no VS Code, abra o projeto, execute a extensão em modo debug e acesse o painel ATLAS na Activity Bar.

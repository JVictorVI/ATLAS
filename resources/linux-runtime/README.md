# Runtime Linux do ATLAS

O VSIX Linux distribui um carregador ELF e as bibliotecas usadas pelos processos
ChromaDB e llama-server: GLIBC 2.39, libstdc++, libgcc, OpenMP e OpenSSL 3.
`launch.cjs` inicia cada processo com o carregador e `--library-path` privados.
O ambiente e as bibliotecas já carregadas pelo Extension Host permanecem intactos.

O build executa `scripts/prepare-linux-runtime.mjs`, que baixa pacotes Ubuntu
oficiais com versões e SHA-256 fixados em `scripts/linux-runtime-packages.mjs`.
Não executa dpkg/apt nem scripts de instalação. Somente extrai arquivos ELF e
avisos de copyright. Links simbólicos são materializados sob os SONAMEs para
permitir gerar o VSIX no Windows.

Cada diretório de arquitetura contém `manifest.json`, com versões, origens,
links dos arquivos-fonte upstream e hashes dos arquivos redistribuídos. Os
avisos de licença ficam em `licenses/`. Para atualizar o runtime, revise as
versões/hashes fixados e repita os testes de integração do VSIX. O runtime não
recebe atualizações do apt do sistema hospedeiro; atualizações são distribuídas
em novas versões do ATLAS.

O host ainda precisa executar o VS Code Server, ter arquitetura/kernel Linux
compatíveis e permitir executar arquivos na pasta da extensão. Drivers de GPU
e suas bibliotecas específicas continuam sendo fornecidos pelo ambiente.
ARM64 tem pacotes próprios; Alpine/musl não é um target validado.

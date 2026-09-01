# Gabarito de análise

Este arquivo é uma referência para comparar a análise produzida pelo Atlas. Ele
não pretende esgotar todos os problemas: algumas falhas se combinam e permitem
mais de uma classificação.

## Achados críticos

1. **Autenticação forjada:** `actorId` e `actorRole` vêm do corpo HTTP. Qualquer
   cliente pode se declarar administrador e cancelar pedidos.
2. **IDOR em pedidos:** `getOrder` busca apenas por `orderId`, sem autenticação,
   autorização ou escopo de tenant.
3. **Vazamento multi-tenant no cache de carrinho:** a chave contém apenas
   `userId`. IDs iguais em tenants diferentes recebem o mesmo objeto.
4. **Vazamento multi-tenant no estoque:** a reserva escolhe a primeira linha por
   `sku`, ignorando tenant e depósito.
5. **Vazamento multi-tenant em cupom, pedido e pagamento:** consultas e updates
   omitem `tenantId`; códigos e IDs não são globalmente seguros.
6. **Concorrência no estoque:** existe um check-then-act com um `await` entre a
   leitura e a escrita, sem lock, compare-and-swap ou constraint atômica. Duas
   reservas podem deixar `available` negativo.
7. **Concorrência no cupom:** validação e decremento são separados. Várias
   requisições podem consumir a última utilização.
8. **Idempotência tardia e global:** o resultado só é gravado após todos os side
   effects e a chave não inclui tenant/usuário/operação. Requisições simultâneas
   atravessam a verificação, enquanto tenants diferentes podem compartilhar um
   resultado.
9. **Cobrança ambígua em timeout:** o gateway simulado registra a captura e
   depois pode lançar timeout. O chamador não reconcilia o resultado e uma nova
   tentativa pode cobrar novamente quando a chave muda ou não é enviada.
10. **Valor divergente:** o gateway recebe `grandTotal - shipping`, a interface
    mostra `grandTotal`, o cancelamento reembolsa `grandTotal` e o relatório
    apresenta ambos sem reconciliação.
11. **Transação fictícia:** `transaction` não oferece atomicidade, isolamento ou
    rollback. O nome induz confiança que a implementação não fornece.
12. **Evento fora de uma outbox:** o evento é publicado no bloco chamado de
    transação, mas seus handlers são disparados sem `await`. Persistência e
    publicação podem divergir em ambos os sentidos.

## Segurança e privacidade

13. Tenant, IP encaminhado, moeda e trace são aceitos diretamente de headers ou
    payload sem uma fronteira autenticada ou validação de esquema.
14. `requestedCurrency` usa type assertion; qualquer string chega à regra de
    preço e pode causar conversão silenciosa com taxa `1`.
15. CORS permite qualquer origem em um endpoint de checkout.
16. Erros HTTP devolvem stack trace e o request completo, incluindo token do
    cartão e cabeçalhos.
17. O logger registra segredo do gateway, token do cartão, documento, e-mail,
    IP, eventos completos e payloads de webhook.
18. Pedido e evento persistem o token de cartão, aumentando escopo e impacto de
    uma violação e contrariando minimização de dados.
19. Segredos ficam no código/configuração global. Embora os valores deste
    exemplo sejam falsos, o padrão arquitetural é inseguro.
20. O webhook envia o segredo na query string, onde pode parar em proxies,
    histórico e logs, em vez de assinar corpo e timestamp.
21. `searchByCustomerEmail` interpola entrada em SQL. O banco simulado não
    executa, mas a implementação representa injeção SQL real.
22. A exportação CSV não escapa campos. Valores iniciados por `=`, `+`, `-` ou
    `@` podem virar fórmulas quando abertos em planilhas; delimitadores e quebras
    de linha também corrompem o arquivo.
23. Dados pessoais são enviados a todos os sellers no webhook, mesmo que cada
    seller precise somente de seus próprios itens e dados mínimos de entrega.
24. `Boolean(httpRequest.body.enabled)` transforma a string `"false"` em
    `true`, criando comportamento administrativo surpreendente.

## Consistência e confiabilidade

25. Reservas feitas antes da cobrança não são liberadas quando outra reserva,
    antifraude, pagamento, banco ou evento falha.
26. Cancelamento não devolve estoque e persiste `CANCELLED` antes de confirmar o
    reembolso. Falha do gateway deixa estado local e financeiro divergentes.
27. O reembolso usa o valor mostrado, não o valor efetivamente capturado.
28. IDs baseados apenas em `Date.now()` podem colidir no mesmo milissegundo.
29. Carrinho e itens são referências mutáveis compartilhadas entre cache,
    pedido, evento e banco. Limpar ou alterar um objeto pode modificar outro
    agregado já persistido.
30. O cache calcula TTL em milissegundos usando um valor nomeado em segundos;
    `300` expira em 300 ms, não cinco minutos.
31. O cache de pedido também não inclui tenant e devolve referência mutável.
32. O lock em memória é adquirido tarde, após várias chamadas remotas. Ele não
    protege múltiplas instâncias/processos e a chave `cart.id` pode colidir entre
    tenants.
33. O event bus não espera handlers, não persiste mensagens e perde tudo ao
    reiniciar. O produtor recebe sucesso antes de qualquer consumidor terminar.
34. Retry usa o mesmo evento mutável, sem backoff, jitter, deadline ou dead
    letter queue. O contador compartilhado também altera o payload observado.
35. Handlers não implementam inbox/deduplicação. Um retry pode criar múltiplas
    entregas, e-mails e webhooks.
36. `Promise.all` nos webhooks faz uma falha repetir sellers que já receberam a
    mensagem.
37. Eventos não têm versão, correlation/causation ID, contrato estável nem chave
    de ordenação. Consumidores fazem cast do payload sem validação.
38. O worker de fulfillment grava `FULFILLING` mesmo que o pedido já tenha sido
    cancelado; eventos atrasados podem regredir o estado.
39. Falhas de antifraude são tratadas como aprovação (fail-open), inclusive em
    compras de alto valor.
40. Limpar carrinho busca somente por `userId`, podendo apagar o carrinho do
    tenant errado.

## Domínio, dinheiro e tempo

41. Valores monetários usam `number` binário em vez de unidades inteiras ou um
    decimal explícito; arredondamento acontece apenas no total final.
42. O carrinho fornece o preço unitário aceito pelo servidor. Um cliente que
    consiga alterar o carrinho pode definir o próprio preço.
43. Itens podem ter moedas diferentes, mas a conversão considera somente a
    moeda do primeiro item.
44. Taxa de câmbio é estática, não tem data, fonte, validade ou taxa contratada.
45. Frete usa os oito primeiros caracteres do documento como se fossem CEP.
46. Regras de imposto e fidelidade estão embutidas, sem vigência temporal,
    jurisdição completa ou trilha de decisão.
47. O cupom encontrado por código pode pertencer a outro tenant e sua
    porcentagem é aplicada sem limite ou validação adicional.
48. Datas são strings livres e a expiração depende do relógio local da instância,
    sem abstração de clock.

## Operação e manutenibilidade

49. Métricas usam `userId`, `cartId`, `orderId` e `shipmentId` como labels,
    provocando cardinalidade potencialmente ilimitada.
50. `analyticsEvents` cresce para sempre em memória e retém PII.
51. O relatório faz uma consulta de pagamento por pedido (padrão N+1).
52. Configuração é singleton mutável. Testes e requisições interferem entre si;
    alterar maintenance mode afeta todo tenant e toda instância de forma não
    coordenada.
53. Dependências concretas são compostas em um único bootstrap sem interfaces
    de porta, dificultando testes de falha e substituição gradual.
54. Erros de negócio, autenticação, indisponibilidade e programação viram HTTP
    500, impedindo retry e observabilidade corretos.
55. Logs não garantem correlation ID confiável e aceitam objetos de erro que
    serializam mal; ao mesmo tempo, registram contexto sensível em excesso.

## Direção de arquitetura alvo

Uma correção incremental razoável começaria por autenticação centralizada e
contexto de tenant imutável; validação de input; dinheiro em minor units; chaves
e constraints compostas por tenant; operações atômicas para estoque/cupom; e
idempotência persistida antes do primeiro side effect.

Em seguida, separar a máquina de estados do pedido e adotar outbox transacional
no produtor e inbox por consumidor. Cada integração precisa de timeout, retry
classificado, reconciliação e compensação explícita. Eventos devem ser
versionados e conter somente o mínimo de dados. Logs, métricas e relatórios
precisam de redaction, baixa cardinalidade e controles de acesso.

Não é necessário começar por microserviços. Um monólito modular com fronteiras
claras, transações reais e adaptadores testáveis resolve grande parte dos riscos
antes de adicionar a complexidade operacional de distribuição.

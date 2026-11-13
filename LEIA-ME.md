# Vorticis Finanças Pessoais

Sistema completo de controle financeiro pessoal. **Uma única base de código** gera:

| Plataforma | Arquivo | Como é gerado |
|---|---|---|
| Windows | `VorticisFinancasPessoais-Instalador-1.0.N.exe` e `VorticisFinancasPessoais-Portatil-1.0.N.exe` | Electron (automático no GitHub) |
| Android | `VorticisFinancasPessoais.apk` | Capacitor (automático no GitHub) |
| Navegador / PWA | pasta `www` | funciona direto, até offline |

Com a sincronização ativada (Supabase, gratuito), o que você lança no computador aparece no celular e vice-versa.

---

## 1. Funcionalidades

- **Contas e saldos**: conta corrente, poupança, carteira, investimentos e cartões de crédito. Cada conta mostra o **saldo atual** (só o que já foi pago ou recebido) e o **saldo previsto** (inclui os pendentes). Há **ajuste de saldo** para igualar ao banco e opção de arquivar contas.
- **Lançamentos**: receitas, despesas e transferências. Têm status pago/pendente, observações e etiquetas. Podem ser **parcelados** (o valor é dividido e a diferença de centavos fica na 1ª parcela) ou **recorrentes** (mensal, semanal, quinzenal, anual). A lista tem filtros, busca (inclusive por valor) e ações em lote.
- **Cartão de crédito**: limite usado e disponível, **faturas** por ciclo (pelo dia de fechamento e de vencimento), situação (aberta, fechada, paga) e botão "Pagar fatura".
- **Importação de extratos**:
  - **OFX/QFX**: o formato recomendado. Evita duplicidade pelo identificador do banco e confere o saldo informado pelo banco.
  - **CSV/TXT**: separador detectado sozinho (`;` `,` tab). Aceita uma coluna de valor ou colunas separadas de débito e crédito. O formato da data e o separador decimal podem ser escolhidos. O mapeamento de colunas fica salvo por conta.
  - **Excel**: XLS, XLSX e ODS.
  - **PDF**: lê o texto de PDFs gerados pelo banco. PDF escaneado não funciona. Revise sempre o resultado.
  - **Texto colado** do internet banking.
  - **Duplicados** já existentes são detectados e desmarcados. Em Configurações você pode **desfazer** uma importação.
  - **Categorização automática**, por regras e pelo histórico.
- **Open Finance (automático, via Pluggy)**: você entra no app e toca em **Conectar banco**. A tela da Pluggy abre dentro do app, sem digitar chaves. Os lançamentos das contas e cartões chegam direto do banco e os empréstimos vão para **Endividamento**. Tudo passa pela tela de revisão da importação, então nada é duplicado. Veja a seção 4.
- **Planilhas**: exporta tudo para Excel e importa a planilha modelo. Reimportar uma planilha exportada **atualiza os lançamentos sem duplicar**.
- **Relatórios em PDF, Excel e CSV**: resumo do período, despesas e receitas por categoria, fluxo de caixa mensal, comparativo categorias × meses, extrato da conta com saldo linha a linha, lançamentos detalhados, orçamento × realizado, saldos das contas em uma data e faturas do cartão.
- **Orçamentos** por categoria, com alerta de ritmo e sugestão automática pela média dos últimos 3 meses.
- **Metas**: valor guardado manualmente ou ligado ao saldo de uma conta. Mostra quanto guardar por mês.
- **Endividamento**: cadastro de empréstimos, financiamentos, cheque especial, acordos e contas atrasadas, além dos cartões de crédito, que entram automaticamente.
  - **Indicadores**: total devido, parcelas por mês, valor em atraso, juros médios e **comprometimento da renda**. A referência usual é: até 30% saudável, até 50% atenção, acima disso crítico.
  - **Plano de quitação**: simula a estratégia *avalanche* (maiores juros primeiro) e a *bola de neve* (menores saldos primeiro), com um valor extra opcional por mês. Mostra em quantos meses você fica livre das dívidas e quanto economiza de juros.
  - **Pagamentos**: ao registrar um pagamento, o app lança a despesa na conta, abate do saldo devedor e marca a dívida como quitada quando ela zera.
  - **Registrato (Banco Central)**: importa o PDF "Empréstimos e Financiamentos (SCR)". Esse relatório lista tudo o que os bancos informam no seu CPF. Reimportar todo mês **atualiza** os valores, sem duplicar.
  - **Atalhos para as consultas gratuitas oficiais**: Serasa, SPC Brasil, Boa Vista (SCPC) e protestos em cartório (CENPROT).
  - **Relatório** de endividamento em PDF ou Excel.
- **Painel** com gráficos, contas a pagar e receber e evolução do patrimônio.
> **Por que a consulta ao Serasa, SPC e Banco Central não é automática?** Esses órgãos não oferecem consulta por sistema (API) para pessoa física.
> - **Serasa, SPC e Boa Vista:** só vendem a integração para empresas, com contrato, CNPJ e cobrança por consulta.
> - **Registrato (Banco Central):** funciona apenas no site do Banco Central, com login gov.br.
> - **Open Finance:** exige uma empresa intermediária paga (em geral milhares de reais por mês).
>
> Por isso o app traz o caminho oficial e gratuito. O relatório do Registrato é importado direto. As pendências encontradas no Serasa, SPC, Boa Vista ou em protestos você cadastra informando a origem.

- **Segurança e outros**: PIN de acesso, tema claro/escuro, backup e restauração (.json), funcionamento 100% offline.

---

## 2. Gerar o .exe (Windows) e o .apk (Android): passo a passo

Os aplicativos são compilados de graça nos servidores do GitHub. Você não precisa instalar nada de programação.

1. Crie uma conta em <https://github.com> (gratuita).
2. Clique em **New repository**, dê um nome (ex.: `financas-pessoais`) e marque **Private** se preferir. Clique em **Create repository**.
3. Envie os arquivos deste projeto para o repositório. A forma mais fácil:
   - Instale o **GitHub Desktop** (<https://desktop.github.com>).
   - Use **File → Clone repository** para clonar o repositório vazio.
   - Copie **todo o conteúdo** desta pasta para dentro da pasta clonada, incluindo a pasta oculta `.github`.
   - Escreva uma mensagem e clique em **Commit to main** e depois em **Push origin**.
4. No site do GitHub, abra a aba **Actions**. A execução **"Gerar aplicativos"** começa sozinha e leva cerca de 10 minutos.
5. Quando ficar verde ✔, clique nela e baixe em **Artifacts**:
   - `windows-exe`: tem o **instalador** e a versão **portátil** (roda sem instalar).
   - `android-apk`: tem o **VorticisFinancasPessoais.apk**.

> **Atualizações:** a cada novo envio (push), novos arquivos são gerados. O APK usa sempre a mesma assinatura (pasta `android-signing`), então você instala por cima da versão anterior **sem perder os dados**.
> Cada compilação também publica automaticamente uma **versão** (ex.: `v1.0.3`) com os arquivos anexados, na seção **Releases** do repositório. É o jeito mais fácil de baixar.

### Instalar no Android
1. Copie o `VorticisFinancasPessoais.apk` para o celular (pelo Google Drive, por cabo ou pelo WhatsApp para você mesmo).
2. Toque no arquivo. Se o Android pedir, permita **"Instalar apps desconhecidos"** para o aplicativo que está abrindo o arquivo.
3. Toque em **Instalar**. Se aparecer o aviso do Play Protect, escolha **"Instalar assim mesmo"**. Ele aparece porque o app não veio da Play Store.

### Instalar no Windows
Há duas opções:
- **Instalador** (`VorticisFinancasPessoais-Instalador-1.0.N.exe`): instala em poucos segundos, sem perguntas, e cria atalhos na área de trabalho e no menu Iniciar. Para atualizar, basta executar o instalador da versão nova.
- **Portátil** (`VorticisFinancasPessoais-Portatil-1.0.N.exe`): roda sem instalar.

As duas usam a **mesma pasta de dados** (`%APPDATA%\FinancasPessoais`), então dá para trocar de uma para a outra sem perder nada. Não abra as duas ao mesmo tempo: a segunda apenas traz a primeira para a frente.

Se aparecer **"O Windows protegeu o computador"**, clique em **Mais informações → Executar assim mesmo**. O aviso aparece porque o app não tem certificado comercial de assinatura, que é pago. Se algo falhar, os detalhes ficam em `%APPDATA%\FinancasPessoais\registro.txt`.

Cada versão é **testada automaticamente** num Windows do GitHub antes de ser publicada: o processo instala, abre o app, confere a tela, testa a versão portátil e desinstala.

### Atualizar pelo próprio app
A partir da versão 1.0.13, o app verifica sozinho se há versão nova ao abrir (no máximo a cada 6 horas). Quando houver, aparece uma faixa no topo com **Baixar e instalar**. Também dá para verificar em **Configurações → Atualizações**.
- **Windows (instalado):** baixa a nova versão, confere o arquivo, fecha e reabre já atualizado.
- **Windows (portátil):** baixa o novo `.exe` portátil na mesma pasta e abre a versão nova. O arquivo antigo pode ser apagado depois.
- **Android:** baixa o novo APK dentro do app e abre o instalador do Android. Na primeira vez, permita **"Instalar apps desconhecidos"** para o Vorticis Finanças Pessoais.
- **Seus dados são mantidos** em todos os casos.

Quem está numa versão anterior à 1.0.13 precisa instalar a 1.0.13 manualmente uma vez. Depois disso, as atualizações são feitas pelo app.

### Versão web (opcional)
O workflow pode publicar a pasta `www` no **GitHub Pages** (exige repositório público ou plano pago). Para ativar: em **Settings → Pages**, escolha *Source: GitHub Actions*; depois, em **Settings → Secrets and variables → Actions → Variables**, crie `PUBLICAR_WEB` com valor `true`. O endereço aparece em Settings → Pages. Por ele, dá para **instalar como app** pelo Chrome/Edge, inclusive no celular.

---

## 3. Sincronizar computador e celular (Supabase, gratuito)

1. Crie uma conta em <https://supabase.com> e clique em **New project**. Escolha nome, senha do banco e região (ex.: South America – São Paulo).
2. No projeto, abra **SQL Editor → New query**, cole **todo** o conteúdo do arquivo `supabase/schema.sql` e clique em **Run**.
3. Em **Project Settings → API** (ou **Connect**), copie:
   - **Project URL**, no formato `https://xxxxxxxx.supabase.co`
   - **anon public key** (ou **publishable key**)
4. No app, abra **Configurações → Sincronização**. Preencha a URL, a chave, seu e-mail e uma senha, e clique em **Criar conta**.
   - O Supabase envia um e-mail de confirmação. Confirme e depois clique em **Entrar e sincronizar**.
   - Para não precisar confirmar: Supabase → Authentication → Sign In / Providers → Email → desligue **Confirm email**.
5. No outro aparelho, preencha a **mesma URL, chave, e-mail e senha** e clique em **Entrar e sincronizar**.

A partir daí a sincronização é automática: logo após cada alteração, a cada minuto e ao reabrir o app. Sem internet, tudo continua funcionando e é enviado quando a conexão voltar. Se o mesmo lançamento for alterado nos dois aparelhos, vale a alteração **mais recente**.

**Dica:** preencha a URL e a chave em `www/config.js` **antes** de enviar ao GitHub. Assim os aplicativos já vêm configurados e basta entrar com e-mail e senha. A chave "anon" é pública por natureza: a proteção dos dados vem do login e das regras de segurança (RLS) criadas pelo `schema.sql`. Cada usuário só acessa os próprios dados.

---

## 4. Open Finance: lançamentos direto do banco (Pluggy)

Só instituições autorizadas pelo Banco Central podem receber dados do Open Finance. Por isso o app usa a **Pluggy**, uma intermediária autorizada.

**Como fica no dia a dia:** você entra no app com seu e-mail e senha, abre **Open Finance** e toca em **Conectar banco**. A tela da Pluggy abre dentro do app: você escolhe o banco e autoriza no app do banco. Depois disso:
- os lançamentos chegam pela tela de revisão da importação, sem duplicar;
- os empréstimos vão para **Endividamento**;
- as conexões aparecem em todos os seus aparelhos.

Não é preciso digitar chave nem ID.

As chaves da Pluggy ficam guardadas **só no seu servidor** (Supabase), numa função chamada `pluggy`. Elas nunca vão dentro do `.exe` ou do `.apk`, que são públicos.

### Situação atual deste repositório
O servidor já foi criado no seu Supabase: projeto **financas-pessoais**, em São Paulo, com as tabelas e a função `pluggy` publicadas. Os aplicativos já vêm apontando para ele. Falta só cadastrar as chaves da Pluggy:
1. Crie a conta em <https://dashboard.pluggy.ai> e copie o **Client ID** e o **Client Secret**.
2. No Supabase, abra o projeto **financas-pessoais → Edge Functions → Secrets** (ou **Project Settings → Edge Functions**) e adicione três secrets:
   - `PLUGGY_CLIENT_ID`
   - `PLUGGY_CLIENT_SECRET`
   - `ALLOWED_EMAILS`: o seu e-mail; se forem vários, separe por vírgula.
3. No app, abra **Configurações → Sincronização → Criar conta** com esse e-mail e depois clique em **Entrar e sincronizar**. Em seguida abra **Open Finance → Conectar banco**.

### Configuração única para um servidor novo (pelo GitHub)
1. **Supabase:** crie o projeto gratuito (seção 3, passos 1 a 3). Anote o **Reference ID**, que aparece no endereço `https://supabase.com/dashboard/project/<ID>`.
2. **Token do Supabase:** em <https://supabase.com/dashboard/account/tokens>, clique em **Generate new token** e copie.
3. **Pluggy:** crie a conta em <https://dashboard.pluggy.ai> e copie o **Client ID** e o **Client Secret** da sua aplicação.
4. **GitHub:** no repositório, abra **Settings → Secrets and variables → Actions → New repository secret** e cadastre:

   | Nome | Valor |
   |---|---|
   | `SUPABASE_PROJECT_REF` | o Reference ID do passo 1 |
   | `SUPABASE_ACCESS_TOKEN` | o token do passo 2 |
   | `PLUGGY_CLIENT_ID` | Client ID da Pluggy |
   | `PLUGGY_CLIENT_SECRET` | Client Secret da Pluggy |
   | `ALLOWED_EMAILS` | o(s) e-mail(s) que podem usar o Open Finance, separados por vírgula (o seu) |

5. **Publicar o servidor:** na aba **Actions**, abra **"Configurar servidor (Supabase)"** e clique em **Run workflow**. Essa ação:
   - cria as tabelas e as regras de segurança;
   - guarda as chaves da Pluggy no Supabase;
   - publica a função `pluggy` e testa se ela está no ar.
6. **Gerar os aplicativos já configurados:** rode **"Gerar aplicativos"** (Run workflow) ou envie qualquer alteração. Com os secrets cadastrados, o `.exe` e o `.apk` já vêm com o endereço do seu servidor.
7. **No app:** em **Configurações → Sincronização**, use **Criar conta** com o e-mail informado em `ALLOWED_EMAILS` e depois **Entrar e sincronizar**. Em seguida abra **Open Finance → Conectar banco**.

**Segurança:**
- Só os e-mails em `ALLOWED_EMAILS` conseguem usar a função.
- Cada login só enxerga as conexões vinculadas a ele.
- Depois de criar sua conta, você pode desligar novos cadastros no Supabase: **Authentication → Sign In / Providers → Allow new users to sign up**.

**Plano gratuito da Pluggy:** não foi possível confirmar se a tela de conexão dentro de outro app está incluída no plano gratuito. Se a Pluggy recusar, há duas saídas:
- conecte o banco no **Meu Pluggy** (<https://meu.pluggy.ai>) e use **"Já conectei um banco no Meu Pluggy: vincular pelo ID"** na tela Open Finance;
- use o **modo avançado**, com as chaves guardadas no aparelho.

Observações:
- Lançamentos ainda **pendentes** no banco ficam de fora e entram quando forem confirmados.
- O consentimento do Open Finance vence. Quando aparecer "Precisa reconectar", use o botão **Reconectar**.
- Se preferir não usar nenhum serviço externo, continue com OFX/CSV (seção 5).

---

## 5. Como exportar o extrato do seu banco

Procure no internet banking (computador) por **Extrato → Exportar / Salvar como / Baixar**:
- **OFX** (às vezes aparece como "Money", "Quicken" ou "Gerenciador financeiro"): é a melhor opção.
- **CSV / Excel**: boa opção. Nubank, Inter e outros oferecem CSV da conta e da fatura.
- **PDF**: funciona com PDFs gerados pelo banco. Revise os sinais (entrada +, saída −) antes de importar.

**Fatura de cartão em CSV:** importe na conta do tipo *Cartão de crédito*. O sistema percebe que as compras vêm positivas e sugere **inverter o sinal**.

---

## 6. Primeiros passos no app

1. **Contas e cartões → Nova conta**: cadastre cada conta com o saldo que ela tinha antes do primeiro lançamento. Nos cartões, informe limite, dia de fechamento e dia de vencimento.
2. Lance as despesas e receitas pelo botão **+** ou **importe os extratos**.
3. Defina **orçamentos** e **metas**.
4. Faça um **backup** de vez em quando (Configurações → Fazer backup). Com a sincronização ativa, a nuvem também guarda seus dados.

Quer só conhecer o sistema? Clique em **"Ver com dados de exemplo"** no painel. Depois remova esses dados em Configurações.

---

## 7. Para desenvolvedores

```
www/                 interface (HTML/CSS/JS puro, sem build), usada pelos 3 apps
  js/store.js        banco local (IndexedDB) com exclusão lógica e marcação de pendências de envio
  js/sync.js         sincronização via API REST do Supabase ("último a salvar vence")
  js/finance.js      regras: saldos, parcelas, faturas, orçamentos, categorização
  js/debts.js        endividamento: indicadores, plano de quitação, leitura do Registrato (SCR)
  js/openfinance.js  Open Finance via Pluggy (contas, lançamentos, empréstimos)
  js/updater.js      atualização dentro do app (Windows, Android)
  js/importers.js    OFX, CSV, Excel, PDF e texto
  js/reports.js      relatórios → tela, PDF (jsPDF), Excel (SheetJS), CSV
  vendor/            bibliotecas locais (funciona offline)
desktop/             Electron (Windows) + atualizador (updater.js)
capacitor.config.json, package.json   Capacitor (Android)
supabase/schema.sql  tabelas, segurança (RLS) e regra de conflito
supabase/functions/pluggy  função do servidor para o Open Finance (guarda as chaves da Pluggy)
assets/icone/        gerador do ícone (família Vorticis)
.github/workflows/   compilação automática do APK e do EXE
```

Comandos locais (opcionais):
- **Testar no navegador:** `npm run web` e abra <http://localhost:8080>.
- **Windows:** dentro da pasta `desktop`, rode `npm install`, depois `npm start` para abrir ou `npm run dist` para gerar os .exe.
- **Android** (requer Android Studio): rode `npm install`, `npx cap add android`, `npm run android:icons`, `npx cap sync android` e `npm run android:apk`.

Valores são guardados em **centavos (inteiros)**, para não haver erros de arredondamento. As datas ficam no formato `AAAA-MM-DD`.

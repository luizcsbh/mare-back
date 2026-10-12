# API Maré

API REST da Maré, implementada com Node.js, Express e MongoDB/Mongoose.

## Requisitos

- Node.js 20.19 ou superior.
- MongoDB local ou MongoDB Atlas.

## Desenvolvimento

Dentro da pasta do backend, instale as dependências:

```bash
cd server
npm install
```

Copie `.env.example` para `.env` e configure `MONGODB_URI` e `JWT_SECRET`. Inicie a API:

```bash
npm run dev
```

Execute esse comando dentro da pasta `server`. A API escuta na porta `3001` por padrão. O frontend local em `http://localhost:5173` chama a API através do proxy do Vite. `CLIENT_ORIGIN` aceita uma lista separada por vírgulas de origens exatas, sem caminho, por exemplo:

```env
CLIENT_ORIGIN=http://localhost:5173
```

## Configuração de produção

Configure estas variáveis no gerenciador de segredos da plataforma de hospedagem; não comite um `.env` real:

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `NODE_ENV` | Sim | Defina `production` para habilitar as configurações de produção do Node e cookies seguros. |
| `PORT` | Conforme a plataforma | Porta fornecida pelo serviço; padrão `3001`. |
| `MONGODB_URI` | Sim | URI privada do MongoDB. Restrinja o acesso de rede do banco à API e use credenciais próprias para o serviço. |
| `JWT_SECRET` | Sim | Segredo aleatório, forte e exclusivo desta instalação. Gere e armazene fora do código-fonte. |
| `CLIENT_ORIGIN` | Sim | Origens HTTPS exatas permitidas, separadas por vírgula, sem barra/caminho, por exemplo `https://app.seudominio.com`. |
| `COOKIE_SAME_SITE` | Conforme topologia | `lax` para frontend/API no mesmo site; `none` somente se forem sites diferentes, sempre com HTTPS. |
| `STORAGE_DRIVER` | Sim para produção | Use `s3` para armazenar laudos em bucket privado; não use armazenamento local efêmero da plataforma. |
| `AWS_REGION`, `S3_BUCKET` | Para S3 | Região e nome do bucket privado. |
| `S3_ENDPOINT` | Se necessário | Endpoint de provedor compatível com S3. |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Conforme provedor | Credenciais restritas ao bucket, fornecidas como segredos da plataforma. |
| `LOG_LEVEL` | Não | Nível de log do Pino; padrão `info`. |

Em produção, a aplicação falha ao iniciar se `CLIENT_ORIGIN` estiver ausente ou alguma origem configurada não usar HTTPS. Chamadas a `/api` também precisam enviar uma origem permitida; pedidos sem `Origin` ou com origem não autorizada são recusados. Em desenvolvimento, pedidos sem `Origin` continuam permitidos para o proxy local do Vite; origens presentes fora da allowlist são recusadas. `/health` e `/ready` permanecem disponíveis para verificações operacionais.

Configure `VITE_API_URL` no build do frontend com a URL pública da API terminada em `/api`. A URL pública do frontend deve corresponder exatamente a uma das entradas de `CLIENT_ORIGIN`. Para cookies entre sites, use `COOKIE_SAME_SITE=none`; cookies `SameSite=None` são enviados com `Secure` e exigem HTTPS. Mesmo em subdomínios distintos, prefira que frontend e API compartilhem o mesmo domínio registrável para reduzir bloqueios de cookies de terceiros.

Execute a API em um serviço Node.js persistente, não no GitHub Pages. O endpoint `/ready` retorna indisponibilidade até que o MongoDB esteja conectado e `JWT_SECRET` esteja configurado.

## Controles de segurança

- CORS com credenciais e allowlist de origem; a origem também é verificada antes de atender a API.
- `helmet`, validação de entrada, limite de JSON, limites de requisições para autenticação e exames e logs estruturados com redaction.
- Senhas com bcrypt; access tokens de curta duração e refresh tokens rotativos armazenados como hash.
- Cookies de sessão `HttpOnly`, `Secure` em produção, proteção CSRF para operações mutáveis e isolamento de registros pelo usuário autenticado.
- Uploads limitados a 10 MB, validados por extensão, MIME e assinatura do conteúdo. Em produção, os arquivos devem ficar em armazenamento S3 privado.

**Limite importante:** essas verificações de origem restringem o acesso a partir de navegadores, mas não autenticam o frontend. `Origin` pode ser forjado por clientes fora do navegador, e o código do frontend é público. Portanto, não é possível garantir que somente a aplicação frontend acesse uma API pública usando apenas CORS, uma chave embutida no frontend ou a URL da API. Proteja cada dado e operação na API com autenticação, autorização e validação; não confie no cliente. Se for necessário impedir acesso público à API, ela precisa de uma arquitetura de rede/identidade adicional que não dependa de um segredo distribuído ao navegador.

Não publique `.env`, credenciais, dumps do banco, uploads ou dados reais de saúde. Restrinja também o acesso ao painel, banco, bucket e backups.

## Comandos

```bash
cd server
npm start
npm test
```

## Publicar o backend no GitHub

Crie um repositório vazio separado para o backend e envie somente esta pasta:

```bash
cd server
git init
git add .
git commit -m "Publica a API"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/mare-back.git
git push -u origin main
```

O `.gitignore` do backend exclui `.env`, `node_modules` e uploads locais. Confira os arquivos preparados antes de publicar e nunca force a inclusão de segredos ou arquivos de saúde.

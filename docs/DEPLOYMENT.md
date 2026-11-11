# VPS — publicação em 11 de novembro de 2026

Acesso: https://76.13.113.108:8445/

O aplicativo está disponível por IP com certificado HTTPS válido. A conta local foi preservada por uma cópia consistente do SQLite, transferida por SSH; a senha de acesso ao aplicativo não foi alterada. Nenhuma credencial SSH, banco ou chave privada foi enviada ao Git.

## Isolamento

| Recurso | Exclusivo do salão |
| --- | --- |
| Código | /opt/invictus-beauty/app |
| Runtime Node.js | /opt/invictus-beauty/runtime/node — v24.19.0, cópia independente do runtime disponível na VPS |
| Usuário sem login | invictus-beauty |
| Banco persistente | /var/lib/invictus-beauty/invictus.sqlite |
| Configuração de ambiente | /etc/invictus-beauty/env, acessível apenas a root |
| API interna | 127.0.0.1:18475 |
| HTTPS público | porta 8445 |
| Nginx separado | /opt/invictus-beauty/nginx.conf |
| Temporários e cache | /var/cache/invictus-beauty |
| Logs | /var/log/invictus-beauty |
| Backups | /var/backups/invictus-beauty |
| Certificado do projeto | /opt/invictus-beauty/tls |

Não foram alterados sites existentes do Nginx, nem reiniciados serviços dos outros projetos. O Nginx do salão usa processo, PID, configurações, logs, porta e todos os diretórios temporários próprios. Foi acrescentada somente a regra de firewall referente à porta 8445. A comparação de serviços existentes antes/depois não mostrou mudança nos processos ativos.

O certificado do IP já era gerenciado na VPS. A instalação copia certificado e chave para uma pasta exclusiva, sem modificar os originais, e verifica periodicamente se há uma versão renovada. Os caminhos de origem ficam em /etc/invictus-beauty/tls-source.env, fora do Git e legíveis apenas por root. A sincronização recarrega apenas o Nginx do salão. A emissão/renovação do certificado original continua sob o gerenciamento já existente no servidor.

## Serviços e manutenção

```bash
systemctl status invictus-beauty invictus-beauty-web
systemctl restart invictus-beauty
systemctl reload invictus-beauty-web
journalctl -u invictus-beauty --since today
```

Os dois serviços estão habilitados para iniciar com a VPS. A aplicação roda sem root, com acesso de escrita limitado ao próprio banco, teto de memória e limite de CPU. O proxy também tem diretórios e limite de memória próprios.

### Backup consistente

```bash
systemctl start invictus-beauty-backup.service
systemctl list-timers invictus-beauty-backup.timer
```

Backup diário, no calendário do servidor, com atraso aleatório de até 15 minutos. Os arquivos ficam em /var/backups/invictus-beauty. A execução manual foi conferida com sucesso. A retenção desses backups deve ser administrada nessa pasta exclusiva; o instalador não apaga backups.

### Certificado

```bash
systemctl start invictus-beauty-tls.service
systemctl status invictus-beauty-tls.timer
```

A sincronização verifica o IP do certificado, a validade e a correspondência entre certificado e chave. A consulta é horária. Falhas são registradas no journal; não há parada de outros serviços nem tentativa de substituir o gerenciamento de certificados existente.

### Atualização de código

Antes de atualizar, faça um backup e registre o commit em execução. Revise as alterações e rode os testes com o runtime exclusivo; então reinicie somente invictus-beauty.service. Não execute o instalador inicial novamente em uma instalação existente. O script deploy/install-vps.sh recusa banco ou portas já ocupados para evitar substituição acidental.

O banco de produção é independente do banco no computador local depois da migração; não há sincronização automática entre eles. Não copie o banco local novamente sobre o de produção.

## Verificações realizadas

- 52 testes passaram usando Node.js v24.19.0 na própria VPS, com bancos temporários.
- API e Nginx exclusivos ativos; backup e sincronização TLS concluídos com sucesso.
- Acesso HTTPS externo retornou HTTP 200, com verificação de certificado aprovada.
- Tela de login conferida no navegador, sem erros de console observados.
- API protegida retornou 401 sem sessão; tentativa de acessar o banco por HTTP retornou 404.
- Os processos dos serviços dos outros projetos foram comparados antes/depois e permaneceram iguais.

O login em produção deve usar a conta que o proprietário já criou. Não foi alterada senha nem criada conta padrão. O WhatsApp continua desativado, aguardando número, credenciais, modelos e verificação pela Meta.

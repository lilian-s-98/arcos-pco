/**
 * ============================================================================
 *  BACKEND_AUTH.GS — Login e segurança de acesso
 *  AG Construtora / ARCOS
 * ============================================================================
 *  Este arquivo cuida de:
 *   1. Validar login (usuário + senha) na tela inicial do sistema.
 *   2. Permitir trocar a própria senha (recomendado logo após o primeiro
 *      acesso com o usuário admin/admin123 criado pelo setup).
 *
 *  A senha NUNCA é guardada em texto puro na planilha — ela é transformada
 *  em um "hash" (código embaralhado, irreversível) pela função
 *  gerarHashSenha_(), que já está no Backend_Setup.gs.
 * ============================================================================
 */

/**
 * Confere usuário e senha na aba USUARIOS.
 * @param {Object} payload  { usuario, senha }
 * @return {Object} { success, usuario, nome, perfil, obra } ou { success:false, msg }
 */
function validarLogin_(payload) {
  if (!payload || !payload.usuario || !payload.senha) {
    return { success: false, msg: 'Informe usuário e senha.' };
  }

  const usuarios = sheetToObjects_(SHEETS.usuarios);
  const hashDigitado = gerarHashSenha_(payload.senha);

  const usuarioEncontrado = usuarios.find(function (u) {
    return String(u.usuario).trim().toLowerCase() === String(payload.usuario).trim().toLowerCase()
      && String(u.senha_hash) === hashDigitado;
  });

  if (!usuarioEncontrado) {
    return { success: false, msg: 'Usuário ou senha inválidos.' };
  }

  if (!campoEhVerdadeiro_(usuarioEncontrado.ativo)) {
    return { success: false, msg: 'Este usuário está desativado. Fale com o administrador do sistema.' };
  }

  // Atualiza a data do último acesso — se falhar por qualquer motivo, o login
  // continua funcionando normalmente (isso é só um registro informativo).
  try {
    updateObjectRowById_(SHEETS.usuarios, HEADERS.usuarios, usuarioEncontrado.id, {
      ultimo_acesso: new Date()
    });
  } catch (erro) { /* intencionalmente ignorado */ }

  return {
    success: true,
    id: usuarioEncontrado.id,
    usuario: usuarioEncontrado.usuario,
    nome: usuarioEncontrado.nome_completo || usuarioEncontrado.usuario,
    perfil: usuarioEncontrado.perfil || 'eng',   // 'pco' | 'eng' | 'sup'
    obra: usuarioEncontrado.obra_vinculada || ''
  };
}

/**
 * Permite que o próprio usuário logado troque a senha.
 * @param {Object} payload  { usuario, senha_atual, senha_nova }
 */
function trocarSenha_(payload) {
  if (!payload || !payload.usuario || !payload.senha_atual || !payload.senha_nova) {
    return { success: false, msg: 'Preencha usuário, senha atual e nova senha.' };
  }
  if (String(payload.senha_nova).length < 6) {
    return { success: false, msg: 'A nova senha precisa ter pelo menos 6 caracteres.' };
  }

  const usuarios = sheetToObjects_(SHEETS.usuarios);
  const hashAtual = gerarHashSenha_(payload.senha_atual);

  const usuarioEncontrado = usuarios.find(function (u) {
    return String(u.usuario).trim().toLowerCase() === String(payload.usuario).trim().toLowerCase()
      && String(u.senha_hash) === hashAtual;
  });

  if (!usuarioEncontrado) {
    return { success: false, msg: 'Senha atual incorreta.' };
  }

  updateObjectRowById_(SHEETS.usuarios, HEADERS.usuarios, usuarioEncontrado.id, {
    senha_hash: gerarHashSenha_(payload.senha_nova)
  });

  return { success: true, msg: 'Senha alterada com sucesso.' };
}

/**
 * Helper pequeno: a coluna "ativo" pode vir como boolean (true), texto "TRUE"
 * ou texto "SIM" dependendo de como foi digitada na planilha — esta função
 * interpreta todos os formatos como "verdadeiro" para evitar bugs bobos.
 */
function campoEhVerdadeiro_(valor) {
  if (valor === true) return true;
  const texto = String(valor).trim().toUpperCase();
  return texto === 'TRUE' || texto === 'SIM' || texto === '1';
}

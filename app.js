// app.js

// Inicializar Supabase sin import, usando la librería global cargada en index.html
const client = supabase.createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_KEY
);



document.addEventListener('DOMContentLoaded', () => {
  // Auth
  document.getElementById('btn-signin').addEventListener('click', signIn)
  document.getElementById('btn-signup').addEventListener('click', signUp)
  document.getElementById('btn-logout').addEventListener('click', signOut)
  client.auth.onAuthStateChange((event, session) => {
    if (session) showApp()
    else showAuth()
  })

  // Formulario
  document.getElementById('transactionForm').addEventListener('submit', handleSubmit)
  document.getElementById('exportExcel').addEventListener('click', exportToExcel)
})

async function signIn() {
  const email = document.getElementById('auth-email').value
  const password = document.getElementById('auth-password').value
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) alert(error.message)
}

async function signUp() {
  const email = document.getElementById('auth-email').value
  const password = document.getElementById('auth-password').value
  const { data, error } = await client.auth.signUp({ 
    email, 
    password,
    options: {
      emailRedirectTo: window.location.href // Opcional: URL de redirección después de confirmación
    }
  })
  
  if (error) {
    alert(`Error: ${error.message}`)
    return
  }
  
  if (data?.user && !data.user.identities?.length) {
    alert('Este correo ya está registrado')
    return
  }
  
  // Mostrar mensaje de confirmación
  document.getElementById('auth-form').style.display = 'none'
  document.getElementById('confirmation-message').style.display = 'block'
}

async function signOut() {
  await client.auth.signOut()
}

function showAuth() {
  document.getElementById('auth-container').style.display = 'block'
  document.getElementById('app-container').style.display = 'none'
}

function showApp() {
  document.getElementById('auth-container').style.display = 'none'
  document.getElementById('app-container').style.display = 'block'
  initApp()
}

async function initApp() {
  setCurrentDate()
  await loadTransactions()
  await updateBalances()
  populateMonthSelector()
}

function setCurrentDate() {
  const now = new Date()
  document.getElementById('currentDate').textContent = now.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}

async function handleSubmit(e) {
  e.preventDefault()
  // Obtener la sesión actual y el usuario en v2
  const { data: { session }, error: sessionError } = await client.auth.getSession()
  if (sessionError || !session) {
    return alert('No se pudo obtener la sesión de usuario')
  }
  const user = session.user
  
  const tx = {
    user_id: user.id,
    type: document.getElementById('type').value,
    amount: parseFloat(document.getElementById('amount').value),
    description: document.getElementById('description').value,
    date: new Date().toISOString() 
  }
  const { error } = await client.from('Finanzas').insert([tx])
  if (error) return alert(error.message)
  e.target.reset()
  await loadTransactions()
  await updateBalances()

}


async function loadTransactions() {
  const { data, error } = await client
    .from('Finanzas')
    .select('*')
    .order('date', { ascending: false })
  if (error) return console.error(error)
  renderTransactions(data)
  setupMonthFilter(data)
}

function renderTransactions(transactions) {
  const tbody = document.querySelector('#FinanzasTable tbody')
  tbody.innerHTML = ''
  transactions.forEach(tx => {
    const tr = document.createElement('tr')
    tr.innerHTML = `
      <td data-label="Fecha">${new Date(tx.date).toLocaleDateString('es-ES')}</td>
      <td data-label="Tipo">${tx.type}</td>
      <td data-label="Monto" class="${tx.type==='gasto'?'negative':'positive'}">$${tx.amount.toFixed(2)}</td>
      <td data-label="Descripción">${tx.description}</td>
      <td data-label="Eliminar"><button onclick="deleteTx('${tx.id}')">🗑️</button></td>
    `
    tbody.appendChild(tr)
  })
}


function populateMonthSelector() {
    const months = [
        'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
        'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
    ];

    const selector = document.getElementById('monthSelector');
    selector.innerHTML = '';
    months.forEach((month, index) => {
        const option = document.createElement('option');
        option.value = index + 1;
        option.textContent = month;
        option.selected = index === new Date().getMonth();
        selector.appendChild(option);
    });
}

async function exportToExcel() {
    const { data } = await client
        .from('Finanzas')
        .select('*');

    const workbook = XLSX.utils.book_new();
    const currentYear = new Date().getFullYear();

    // Crear una hoja por mes
    for (let month = 0; month < 12; month++) {
        const monthlyData = data.filter(t => 
            new Date(t.date).getMonth() === month && 
            new Date(t.date).getFullYear() === currentYear
        );
        
        if (monthlyData.length > 0) {
            const worksheet = XLSX.utils.json_to_sheet(monthlyData);
            XLSX.utils.book_append_sheet(
                workbook, 
                worksheet, 
                `${String(month + 1).padStart(2, '0')}-${currentYear}`
            );
        }
    }

    XLSX.writeFile(workbook, `Finanzas_${currentYear}.xlsx`);
}

async function deleteTx(id) {
  const { error } = await client.from('Finanzas').delete().eq('id', id)
  if (error) return alert(error.message)
  await loadTransactions()
}

function setupMonthFilter(data) {
    const selector = document.getElementById('monthSelector');
    selector.addEventListener('change', () => {
        const selectedMonth = parseInt(selector.value) - 1;
        const currentYear = new Date().getFullYear();
        const filtered = data.filter(t => 
            new Date(t.date).getMonth() === selectedMonth &&
            new Date(t.date).getFullYear() === currentYear
        );
        renderTransactions(filtered);
    });
}

// app.js (actualización de la función updateBalances)
async function updateBalances() {
  const { data: transactions, error } = await client
    .from('Finanzas')
    .select('*');

  if (error) return console.error(error);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();

  // Balance del mes actual
  const currentMonthTx = transactions.filter(tx => {
    const txDate = new Date(tx.date);
    return txDate.getMonth() === currentMonth && 
           txDate.getFullYear() === currentYear;
  });

  const currentBalance = currentMonthTx.reduce((acc, tx) => {
    return tx.type === 'ingreso' ? acc + tx.amount : acc - tx.amount;
  }, 0);

  document.getElementById('currentBalance').textContent = currentBalance.toFixed(2);

  // Balance anual
  const annualTx = transactions.filter(tx => {
    const txDate = new Date(tx.date);
    return txDate.getFullYear() === currentYear;
  });

  const annualBalance = annualTx.reduce((acc, tx) => {
    return tx.type === 'ingreso' ? acc + tx.amount : acc - tx.amount;
  }, 0);

  document.getElementById('annualBalance').textContent = annualBalance.toFixed(2);
}
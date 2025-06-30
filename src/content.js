(() => {

  const body = document.body || document.documentElement;
  const isLocal = location.protocol === 'file:';
  const notes = [];
  const htmlNS = "http://www.w3.org/1999/xhtml";

  function startManote() {

    let previousSelection = null;

    // ------ Raccourcis clavier ------
    document.addEventListener('keydown', (e) => {
      if (e.key === 'N' && e.shiftKey && e.ctrlKey) {
        e.preventDefault();
        const selection = window.getSelection();
        if (selection.toString().trim()) {
          addNoteFromSelection(selection);
        } else {
          addNoteFromCursor(selection);
        }
      }

      if (e.key.toLowerCase() === 'n' && e.altKey && !e.shiftKey && !e.ctrlKey) {
        e.preventDefault();
        openNoteTable();
      }

      if (e.key === 'Escape' && document.getElementById('note-table-wrapper')) {
        e.preventDefault();
        closeNoteTable();
      }
    });

    // ------ Création de note sur sélection ------
    function addNoteFromSelection(selection) {
      const text = selection.toString().trim();
      const pageNum = getClosestPageNumFromSelection(selection.anchorNode);
      const title = `${pageNum}_${text.slice(0, 30).replace(/\s+/g, '_')}`;
      const note = prompt(`${pageNum} [${text}]`, '');
      if (note) {
        const el = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
        const posTop = el ? el.getBoundingClientRect().top + window.scrollY : 0;
        notes.push({ title, content: note, selector: el.id, posTop });
        saveNotes();
      }
    }

    // ------ Création de note sur curseur ------
    function addNoteFromCursor(selection) {
      const pageNum = getClosestPageNumFromSelection(selection.anchorNode);
      const sentence = getSentenceFromCursor(selection);
      const similar = notes.filter(n => n.title.startsWith(`${pageNum}_`)).length;
      const title = `${pageNum}_${similar + 1}`;

      const note = prompt(`${pageNum} [${sentence}]`, '');
      if (note) {
        const el = selection.anchorNode.nodeType === 1 ? selection.anchorNode : selection.anchorNode.parentElement;
        const posTop = el ? el.getBoundingClientRect().top + window.scrollY : 0;
        notes.push({ title, content: note, selector: el.id, posTop });
        saveNotes();
      }
    }

    // ------ Trouver l'attribut page-num ------
    function getClosestPageNumFromSelection() {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0) return '0';

      const range = selection.getRangeAt(0);
      const targetNode = range.startContainer;
      const doc = targetNode.ownerDocument || document;
      const root = doc.documentElement;

      const walker = doc.createTreeWalker(
        root,
        NodeFilter.SHOW_ELEMENT,
        null,
        false
      );

      let current;
      let lastPageNum = null;

      while ((current = walker.nextNode())) {
        try {
          // Si current est après le point de sélection, on s'arrête
          const cmp = range.comparePoint(current, 0);
          if (cmp < 0 && current.tagName?.toLowerCase() === 'pagenum') {
            lastPageNum = current.textContent.trim();
          }
          if (cmp >= 0) break;
        } catch (e) {
          // Certains nœuds peuvent planter comparePoint, on les ignore
          continue;
        }
      }

      return lastPageNum || '0';
    }

    // ------ Extraire une phrase depuis le curseur ------
    function getSentenceFromCursor(selection) {
      const node = selection.anchorNode;
      if (!node || node.nodeType !== Node.TEXT_NODE) return '';
      const text = node.textContent;
      const offset = selection.anchorOffset;
      const tail = text.slice(offset);
      const end = tail.indexOf('.') >= 0 ? tail.indexOf('.') + 1 : tail.length;
      return tail.slice(0, end).trim();
    }

    // ------ Enregistrer dans browser.storage ------
    async function saveNotes() {
      const key = await getStorageKey();
      const obj = {};
      obj[key] = notes;
      await browser.storage.local.set(obj);
      loadNotes();
    }

    // ------ Recharger les notes ------
    async function loadNotes() {
      const key = await getStorageKey();
      const full_result = await browser.storage.local.get(null).then(console.log);
      const result = await browser.storage.local.get(key).then((result) => {
        console.log("Notes 🗒️ chargées depuis le stockage ! ds F°");
        const data = result[key] || [];
        notes.length = 0;
        notes.push(...data);
        renderNoteIndicators();
      });
    }


    // ------ Utilitaire de sélection CSS unique (simple) ------
    function getNodeSelector(node) {
      const el = node.nodeType === 1 ? node : node.parentElement;
      if (!el) return '';
      const id = el.id ? `#${el.id}` : '';
      const tag = el.tagName.toLowerCase();
      return `${tag}${id}`;
    }

    // ------ UI accessible ------
    function openNoteTable() {
      if (document.getElementById('note-table-wrapper')) return;

      previousSelection = window.getSelection().getRangeAt(0).cloneRange();

      const wrapper = document.createElementNS(htmlNS,'div');
      wrapper.id = 'note-table-wrapper';
      wrapper.setAttribute('role', 'dialog');
      wrapper.setAttribute('aria-label', 'Liste des notes');
      wrapper.tabIndex = -1;
      wrapper.style.position = 'fixed';
      wrapper.style.top = '10%';
      wrapper.style.left = '10%';
      wrapper.style.width = '80%';
      wrapper.style.height = '80%';
      wrapper.style.overflow = 'auto';
      wrapper.style.background = 'white';
      wrapper.style.border = '2px solid black';
      wrapper.style.zIndex = '9999';
      wrapper.style.padding = '1rem';

      const table = document.createElementNS(htmlNS,'table');
      table.setAttribute('role', 'table');
      table.style.width = '100%';
      table.style.borderCollapse = 'collapse';

      const headerRow = document.createElementNS(htmlNS,'tr');
      ['Titre', 'Note', 'Aller à', 'Modifier', 'Supprimer'].forEach(h => {
        const th = document.createElementNS(htmlNS,'th');
        th.innerText = h;
        th.style.border = '1px solid black';
        th.style.padding = '0.5rem';
        headerRow.appendChild(th);
      });
      table.appendChild(headerRow);

      notes.sort((a, b) => (a.posTop || 0) - (b.posTop || 0));

      notes.forEach((n, i) => {
        const tr = document.createElementNS(htmlNS,'tr');

        const tdTitle = document.createElementNS(htmlNS,'td');
        tdTitle.innerText = n.title;

        const tdContent = document.createElementNS(htmlNS,'td');
        tdContent.innerText = n.content;

        const tdGo = document.createElementNS(htmlNS,'td');
        const goBtn = document.createElementNS(htmlNS,'button');
        goBtn.innerText = '→';
        goBtn.setAttribute('aria-label', `Aller à ${n.title}`);
        goBtn.onclick = () => {
          const el = document.getElementById(n.selector);
          if (el) {
            el.setAttribute("tabindex", "-1");
            el.scrollIntoView();
            el.focus();
          }
        };
        tdGo.appendChild(goBtn);

        const tdEdit = document.createElementNS(htmlNS,'td');
        const editBtn = document.createElementNS(htmlNS,'button');
        editBtn.innerText = '✎';
        editBtn.setAttribute('aria-label', `Modifier ${n.title}`);
        editBtn.onclick = () => {
          const newNote = prompt(`Modifier ${n.title}`, n.content);
          if (newNote) {
            notes[i].content = newNote;
            saveNotes();
            closeNoteTable();
            openNoteTable();
          }
        };
        tdEdit.appendChild(editBtn);

        const tdDel = document.createElementNS(htmlNS,'td');
        const delBtn = document.createElementNS(htmlNS,'button');
        delBtn.innerText = '🗑';
        delBtn.setAttribute('aria-label', `Supprimer ${n.title}`);
        delBtn.onclick = () => {
          if (confirm(`Supprimer ${n.title} ?`)) {
            notes.splice(i, 1);
            saveNotes();
            closeNoteTable();
            openNoteTable();
          }
        };
        tdDel.appendChild(delBtn);

        [tdTitle, tdContent, tdGo, tdEdit, tdDel].forEach(td => {
          td.style.border = '1px solid black';
          td.style.padding = '0.5rem';
          tr.appendChild(td);
        });

        table.appendChild(tr);
      });

      wrapper.appendChild(table);
      body.appendChild(wrapper);
      wrapper.focus();
    }

    function closeNoteTable() {
      const wrapper = document.getElementById('note-table-wrapper');
      if (wrapper) wrapper.remove();
      if (previousSelection) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(previousSelection);
      }
    }


    // Charger les notes au démarrage
    loadNotes().then(() => {
      console.log("Notes 🗒️ chargées depuis le stockage !");
    });

  }

  // Gestion de la clef des notes
  function getStorageKey() {
    if (location.protocol === 'file:') {
      const name = location.pathname.split('/').pop();
      return `notes-${name}`;
    } else {
      return `notes-${location.href}`;
    }
  }

  function renderNoteIndicators() {
    notes.forEach(note => {
      const el = document.getElementById(note.selector);
      console.log(note);
      console.log(el);
      if (el) {
        // Eviter d’injecter plusieurs fois
        if (!el.querySelector('.note-indicator')) {
          const indicator = document.createElementNS(htmlNS,'span');
          indicator.className = 'note-indicator';
          indicator.textContent = '[note] ';
          indicator.style.color = '#009E73'; // ou ta couleur favorite
          indicator.style.fontWeight = 'bold';
          el.insertBefore(indicator, el.firstChild);
        }
      }
    });
  }

  // Start !
  startManote();

})();

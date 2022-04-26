// The following code is based off a toggle menu by @Bradcomp
// source: https://gist.github.com/Bradcomp/a9ef2ef322a8e8017443b626208999c1
(function() {
  var burger = document.querySelector('.burger');
  if (burger) {
    var menu = document.querySelector('#'+burger.dataset.target);
    burger.addEventListener('click', function() {
        burger.classList.toggle('is-active');
        menu.classList.toggle('is-active');
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    (document.querySelectorAll('.message-header > .delete') || []).forEach(($delete) => {
      $message = $delete.parentNode.parentNode;
      $delete.addEventListener('click', () => {
        $message.parentNode.removeChild($message);
      });
    });

    (document.querySelectorAll('.message-header.collapsible') || []).forEach(($collapse) => {
      let $message = $collapse.parentNode;
      $collapse.addEventListener('click', () => {
        $message.classList.toggle('collapsed');
      });
    });

    var questionButton = document.querySelector('#addQuestion')
    if(questionButton)
      questionButton.addEventListener('click', () => {
        var article = document.createElement('article')
        article.className = 'message is-warning';
        article.innerHTML = '<div class="message-header"><p>Вопрос для теста</p><button class="delete" aria-label="delete" title="Удалить урок"></button></div><div class="message-body"><div class="field is-horizontal"><div class="field-body"><div class="field" style="max-width: 35%"><label class="label">Вопрос:</label><div class="control"><input class="input" name="question[]" placeholder="Введите вопрос?"></div><div class="help is-info">В первой строке с ответами должен быть правильный ответ на вопрос, при генерации теста в боте ответы будут перемешиваться автоматически.</div></div><div class="field"><label class="label">Варианты ответов:</label><div class="control"><textarea class="textarea has-fixed-size" name="answer[]" placeholder="Ответы на вопрос построчно\nПравильный ответ ВСЕГДА первый в списке!"></textarea></div></div></div></div></div>';
        document.querySelector('.test-container').appendChild(article);
      });
  });
})();
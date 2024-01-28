---
layout: page
title: java面试系列专栏
titlebar: interview
subtitle: <span class="mega-octicon octicon-clippy"></span> &nbsp;&nbsp; java面试、面试宝典、面试技巧
menu: interview
css: ['blog-page.css']
permalink: /interview
---

<div class="row">

    <div class="col-md-12">
        <ul id="posts-list">
            {% for post in site.posts %}
                {% if post.category=='interview' or post.keywords contains 'interview' %}
                <li class="posts-list-item">
                    <div class="posts-content">
                        <span class="posts-list-meta">{{ post.date | date: "%Y-%m-%d" }}</span>
                        <a class="posts-list-name bubble-float-left" href="{{ site.url }}{{ post.url }}">{{ post.title }}</a>
                        <span class='circle'></span>
                    </div>
                </li>
                {% endif %}
            {% endfor %}
        </ul> 

        <!-- Pagination -->
        {% include pagination.html %}

        <!-- Comments -->
       <div class="comment">
         {% include comments.html %}
       </div>
    </div>

</div>
<script>
    $(document).ready(function(){

        // Enable bootstrap tooltip
        $("body").tooltip({ selector: '[data-toggle=tooltip]' });

    });
</script>
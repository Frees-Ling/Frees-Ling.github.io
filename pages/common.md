---
layout: page
title: 综合 系列文章
titlebar: common
subtitle: <span class="mega-octicon octicon-clippy"></span> &nbsp;&nbsp; 综合 系列文章
menu: common
css: ['blog-page.css']
permalink: /common
---

<div class="row">

    <div class="col-md-12">
        <ul id="posts-list">
            {% for post in site.posts %}
                {% if post.category=='common' or post.keywords contains 'common' %}
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
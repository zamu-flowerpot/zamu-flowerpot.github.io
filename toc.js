// Populate the sidebar
//
// This is a script, and not included directly in the page, to control the total size of the book.
// The TOC contains an entry for each page, so if each page includes a copy of the TOC,
// the total size of the page becomes O(n**2).
class MDBookSidebarScrollbox extends HTMLElement {
    constructor() {
        super();
    }
    connectedCallback() {
        this.innerHTML = '<ol class="chapter"><li class="chapter-item expanded affix "><a href="introduction.html">Introduction</a></li><li class="chapter-item expanded "><div><strong aria-hidden="true">1.</strong> Community Recommendations</div></li><li><ol class="section"><li class="chapter-item expanded "><a href="recommendations/chibipot.html"><strong aria-hidden="true">1.1.</strong> chibipot</a></li><li class="chapter-item expanded "><a href="recommendations/flowerpot.html"><strong aria-hidden="true">1.2.</strong> flowerpot</a></li><li class="chapter-item expanded "><a href="recommendations/haphne.html"><strong aria-hidden="true">1.3.</strong> haphne</a></li><li class="chapter-item expanded "><a href="recommendations/harmony.html"><strong aria-hidden="true">1.4.</strong> harmony</a></li></ol></li><li class="chapter-item expanded "><div><strong aria-hidden="true">2.</strong> Personal Recommendations</div></li><li><ol class="section"><li class="chapter-item expanded "><a href="recommendations/milfoy.html"><strong aria-hidden="true">2.1.</strong> milfoy</a></li><li class="chapter-item expanded "><a href="recommendations/andromeda.html"><strong aria-hidden="true">2.2.</strong> andromeda/harry</a></li></ol></li><li class="chapter-item expanded "><div><strong aria-hidden="true">3.</strong> Work in Progress Recommendations</div></li><li><ol class="section"><li class="chapter-item expanded "><a href="recommendations/hellatrix.html"><strong aria-hidden="true">3.1.</strong> hellatrix</a></li><li class="chapter-item expanded "><a href="recommendations/hinny.html"><strong aria-hidden="true">3.2.</strong> hinny</a></li><li class="chapter-item expanded "><a href="recommendations/honks.html"><strong aria-hidden="true">3.3.</strong> honks</a></li><li class="chapter-item expanded "><a href="recommendations/huna.html"><strong aria-hidden="true">3.4.</strong> huna</a></li><li class="chapter-item expanded "><a href="recommendations/mult.html"><strong aria-hidden="true">3.5.</strong> mult</a></li></ol></li><li class="chapter-item expanded "><a href="side-host.html"><strong aria-hidden="true">4.</strong> Entirely Unrelated</a></li><li><ol class="section"><li class="chapter-item expanded "><a href="side-host/step-ca.html"><strong aria-hidden="true">4.1.</strong> step-ca config</a></li></ol></li><li class="chapter-item expanded "><a href="contribution.html">Contribution</a></li><li class="chapter-item expanded affix "><a href="unsorted.html">Entirely Unsorted</a></li></ol>';
        // Set the current, active page, and reveal it if it's hidden
        let current_page = document.location.href.toString().split("#")[0];
        if (current_page.endsWith("/")) {
            current_page += "index.html";
        }
        var links = Array.prototype.slice.call(this.querySelectorAll("a"));
        var l = links.length;
        for (var i = 0; i < l; ++i) {
            var link = links[i];
            var href = link.getAttribute("href");
            if (href && !href.startsWith("#") && !/^(?:[a-z+]+:)?\/\//.test(href)) {
                link.href = path_to_root + href;
            }
            // The "index" page is supposed to alias the first chapter in the book.
            if (link.href === current_page || (i === 0 && path_to_root === "" && current_page.endsWith("/index.html"))) {
                link.classList.add("active");
                var parent = link.parentElement;
                if (parent && parent.classList.contains("chapter-item")) {
                    parent.classList.add("expanded");
                }
                while (parent) {
                    if (parent.tagName === "LI" && parent.previousElementSibling) {
                        if (parent.previousElementSibling.classList.contains("chapter-item")) {
                            parent.previousElementSibling.classList.add("expanded");
                        }
                    }
                    parent = parent.parentElement;
                }
            }
        }
        // Track and set sidebar scroll position
        this.addEventListener('click', function(e) {
            if (e.target.tagName === 'A') {
                sessionStorage.setItem('sidebar-scroll', this.scrollTop);
            }
        }, { passive: true });
        var sidebarScrollTop = sessionStorage.getItem('sidebar-scroll');
        sessionStorage.removeItem('sidebar-scroll');
        if (sidebarScrollTop) {
            // preserve sidebar scroll position when navigating via links within sidebar
            this.scrollTop = sidebarScrollTop;
        } else {
            // scroll sidebar to current active section when navigating via "next/previous chapter" buttons
            var activeSection = document.querySelector('#sidebar .active');
            if (activeSection) {
                activeSection.scrollIntoView({ block: 'center' });
            }
        }
        // Toggle buttons
        var sidebarAnchorToggles = document.querySelectorAll('#sidebar a.toggle');
        function toggleSection(ev) {
            ev.currentTarget.parentElement.classList.toggle('expanded');
        }
        Array.from(sidebarAnchorToggles).forEach(function (el) {
            el.addEventListener('click', toggleSection);
        });
    }
}
window.customElements.define("mdbook-sidebar-scrollbox", MDBookSidebarScrollbox);
